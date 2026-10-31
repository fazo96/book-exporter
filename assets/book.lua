--[[
  book.lua: the built-in pandoc filter every export runs (docs/pipeline.md).

  Reads the book's structure settings from the JSON file named by
  BOOKX_FILTER_CONFIG (written by lib/build), and is target-aware: for EPUB it
  emits semantic headings, divs and classes that the generated stylesheet
  styles; for Typst it emits calls to the functions in assets/book.typ, with
  headings and quotes passed in as content so their inline markup survives.

  The source arrives assembled by lib/build/assemble.ts:

    ::: {.bookx-matter ...}  a front or back matter section (its title is the
                             first block, a level-1 heading)
    ::: {.bookx-main}        where the story starts (after the front matter)
    ::: {.bookx-end}         the end mark, after the story
    ::: {.bookx-back}        where the back matter starts

  and the manuscript between them, read by heading level:

    shallower than parts/chapters  the book's title (pen's `#`): dropped
    part level                     a part page (numbered if asked)
    chapter level                  a chapter opener (numbered if asked)
    scene level                    a scene break, a small title, or nothing
    `---`, `***`, `⁂`, `* * *`     a scene break, kept only between prose:
                                   one next to a heading or at the start or
                                   end of a chapter is dropped, since the page
                                   turn already marks it
    `>` right after a part or      its epigraph; an attribution paragraph
    chapter heading                (`— Name`) after it is consumed

  A project's own filter.lua runs after this one and sees its output.
]]

local stringify = pandoc.utils.stringify

local cfg = (function()
  local path = os.getenv("BOOKX_FILTER_CONFIG")
  if not path then return {} end
  local f = assert(io.open(path, "r"))
  local text = f:read("a")
  f:close()
  return pandoc.json.decode(text, false)
end)()

local S = cfg.structure or {}
local is_typst = FORMAT:match("typst") ~= nil

local part_level = S.partLevel or 0
local chapter_level = S.chapterLevel or 3
local scene_level = S.sceneLevel or 0
local title_below = math.min(part_level > 0 and part_level or 7, chapter_level)

-- ----------------------------------------------------------------- helpers

local function typst_str(s)
  return '"' .. s:gsub("\\", "\\\\"):gsub('"', '\\"') .. '"'
end

-- Inlines or blocks as Typst markup, to pass as a [content] argument.
local function typst_content(x)
  local blocks
  if x == nil then return "none" end
  if x.t == nil and x[1] and x[1].t and pandoc.utils.type(x[1]) == "Block" then
    blocks = x
  else
    blocks = { pandoc.Plain(x) }
  end
  local out = pandoc.write(pandoc.Pandoc(blocks), "typst")
  return "[" .. out:gsub("%s+$", "") .. "]"
end

local function raw(s)
  return pandoc.RawBlock("typst", s)
end

local function html(s)
  return pandoc.RawBlock("html", s)
end

local ROMAN = {
  { 1000, "M" }, { 900, "CM" }, { 500, "D" }, { 400, "CD" }, { 100, "C" }, { 90, "XC" },
  { 50, "L" }, { 40, "XL" }, { 10, "X" }, { 9, "IX" }, { 5, "V" }, { 4, "IV" }, { 1, "I" },
}
local function roman(n)
  local out = ""
  for _, p in ipairs(ROMAN) do
    while n >= p[1] do
      out = out .. p[2]
      n = n - p[1]
    end
  end
  return out
end

local ONES = { "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" }
local TENS = { "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" }
local function words(n)
  if n < 20 then return ONES[n] end
  if n < 100 then
    local t, o = math.floor(n / 10), n % 10
    return TENS[t] .. (o > 0 and ("-" .. ONES[o]) or "")
  end
  return tostring(n)
end

-- "Chapter Three", "IV", "Part 2"… or nil when unnumbered.
local function number_label(style, label, n)
  if style == nil or style == "none" then return nil end
  local num = style == "roman" and roman(n) or style == "words" and words(n) or tostring(n)
  if label and label ~= "" then return label .. " " .. num end
  return num
end

-- A paragraph that is only ornament (`⁂`, `* * *` written loosely, `~`, `❧`…)
-- is a scene break written by hand. Checked by code point: Lua patterns match
-- bytes, and these are multibyte.
local BREAK_CHARS = {}
for _, c in utf8.codes("*⁂·•~#❧○◦✱✶❦◇◆") do BREAK_CHARS[c] = true end
local function is_break_para(b)
  if b.t ~= "Para" and b.t ~= "Plain" then return false end
  local s = stringify(b):gsub("%s", "")
  if #s == 0 or #s > 24 then return false end
  for _, c in utf8.codes(s) do
    if not BREAK_CHARS[c] then return false end
  end
  return true
end

local function is_attribution(b)
  if not b or b.t ~= "Para" then return false end
  local s = stringify(b)
  return s:match("^\u{2014}") or s:match("^\u{2013}") or s:match("^%-%-")
end

local function strip_dash(inlines)
  local out = pandoc.List(inlines)
  local first = out[1]
  if first and first.t == "Str" then
    local s = first.text:gsub("^\u{2014}", ""):gsub("^\u{2013}", ""):gsub("^%-%-%-?", "")
    if s == "" then
      out:remove(1)
      if out[1] and out[1].t == "Space" then out:remove(1) end
    else
      out[1] = pandoc.Str(s)
    end
  end
  return out
end

local function prose_block(t)
  return t == "Para" or t == "Plain" or t == "CodeBlock" or t == "BulletList" or t == "OrderedList"
    or t == "DefinitionList" or t == "LineBlock" or t == "Table" or t == "Div" or t == "BlockQuote"
    or t == "Figure" or t == "RawBlock"
end

-- ------------------------------------------------------------- the output

local has_parts = false
local out = pandoc.List()
local in_prose = false     -- prose emitted since the last heading or break
local pending_break = false -- a scene break waiting for the prose after it
local expect_epigraph = nil -- "part" | "chapter" right after one's heading
local part_n, chapter_n = 0, 0

local function chapter_out_level() return has_parts and 2 or 1 end

local function scene_break()
  if is_typst then
    out:insert(raw("#scene-break()"))
  else
    local glyph = cfg.sceneBreakGlyph
    if glyph and glyph ~= "" then
      out:insert(pandoc.Div({ pandoc.Para({ pandoc.Str(glyph) }) },
        { class = "scene-break", role = "separator" }))
    else
      out:insert(html('<hr class="scene-break" />'))
    end
  end
end

local function emit(block)
  if pending_break and in_prose then scene_break() end
  pending_break = false
  out:insert(block)
  if prose_block(block.t) then in_prose = true end
end

-- Headings reset the scene state: whatever came before is closed by the page turn.
local function boundary()
  in_prose = false
  pending_break = false
end

-- A heading for EPUB: the number (if any) as its own line inside it, so the
-- reading system's contents list it as "Chapter One Birth" rather than losing it.
local function epub_heading(level, number, content, classes, number_class)
  local inlines = pandoc.List()
  if number then
    inlines:insert(pandoc.Span({ pandoc.Str(number) }, { class = number_class }))
    inlines:insert(pandoc.LineBreak())
  end
  inlines:extend(content)
  return pandoc.Header(level, inlines, { class = classes })
end

-- Consume an epigraph starting at blocks[i] (a BlockQuote): the run of quotes
-- (several `>` paragraphs separated by blank lines are one epigraph) and an
-- attribution paragraph after it. Returns the rendered block(s) and the index
-- of the last block consumed.
local function epigraph(blocks, i, where)
  local quote = pandoc.List(blocks[i].content)
  while blocks[i + 1] and blocks[i + 1].t == "BlockQuote" do
    i = i + 1
    quote:extend(blocks[i].content)
  end
  local attribution = nil
  if is_attribution(blocks[i + 1]) then
    attribution = strip_dash(blocks[i + 1].content)
    i = i + 1
  end
  local rendered = pandoc.List()
  if is_typst then
    local args = "where: " .. typst_str(where)
    if attribution then args = args .. ", attribution: " .. typst_content(attribution) end
    rendered:insert(raw("#epigraph(" .. args .. ")["))
    rendered:extend(quote)
    rendered:insert(raw("]"))
  else
    -- Italic in the markup, not only the stylesheet: readers that ignore
    -- publisher styles would otherwise set the quote as plain prose.
    local inner = pandoc.List()
    inner:insert(pandoc.walk_block(pandoc.BlockQuote(quote), {
      Para = function(p) return pandoc.Para({ pandoc.Emph(p.content) }) end,
      Plain = function(p) return pandoc.Plain({ pandoc.Emph(p.content) }) end,
    }))
    if attribution then
      -- The dash goes back in the markup (hidden by the stylesheet) so the
      -- line still reads as an attribution when styles are ignored.
      local span = pandoc.List({ pandoc.Span({ pandoc.Str("\u{2014}\u{00A0}") }, { class = "dash-fallback" }) })
      span:extend(attribution)
      inner:insert(pandoc.Para({ pandoc.Span(span, { class = "attribution" }) }))
    end
    rendered:insert(pandoc.Div(inner, { class = "epigraph epigraph-" .. where }))
  end
  return rendered, i
end

-- ------------------------------------------------------------ the sections

local EPUB_TYPES = {
  copyright = "copyright-page", dedication = "dedication", epigraph = "epigraph",
  foreword = "foreword", afterword = "afterword", acknowledgments = "acknowledgments",
}

local function matter(div)
  local a = div.attributes
  local style = a["style"] or "plain"
  local show_title = a["show-title"] == "true"
  local in_toc = a["in-toc"] == "true"
  local blocks = div.content
  local title = nil
  if blocks[1] and blocks[1].t == "Header" then
    title = blocks[1].content
    blocks = pandoc.List({ table.unpack(blocks, 2) })
  end
  -- Inside a section, a quote with an attribution is set as an epigraph and
  -- headings sit below the section's title.
  local body = pandoc.List()
  local i = 1
  while i <= #blocks do
    local b = blocks[i]
    if b.t == "BlockQuote" and (style == "epigraph" or is_attribution(blocks[i + 1])) then
      local rendered
      rendered, i = epigraph(blocks, i, "matter")
      body:extend(rendered)
    elseif b.t == "Header" then
      b.level = math.min(6, math.max(b.level, 2) + 1)
      b.classes:insert("unnumbered")
      b.classes:insert("unlisted")
      body:insert(b)
    else
      body:insert(b)
    end
    i = i + 1
  end

  boundary()
  if is_typst then
    local args = "style: " .. typst_str(style) .. ", front: " .. tostring(a["placement"] == "front")
    if title and show_title then
      args = args .. ", title: " .. typst_content(title) .. ", outlined: " .. tostring(in_toc)
    end
    out:insert(raw("#matter-page(" .. args .. ")["))
    out:extend(body)
    out:insert(raw("]"))
  else
    local classes = { "matter-title", "unnumbered" }
    if not show_title then table.insert(classes, "hidden") end
    if not (show_title and in_toc) then table.insert(classes, "unlisted") end
    local h = pandoc.Header(1, title or { pandoc.Str(a["kind"] or "Section") }, { class = table.concat(classes, " ") })
    local etype = EPUB_TYPES[a["kind"] or ""]
    if etype then h.attributes["epub:type"] = etype end
    out:insert(h)
    out:insert(pandoc.Div(body, { class = "matter matter-" .. style }))
  end
end

local function header(b)
  local level = b.level
  if level < title_below then
    return -- the book's title: the title page carries it
  end
  if part_level > 0 and level == part_level then
    part_n = part_n + 1
    boundary()
    expect_epigraph = "part"
    local number = number_label(S.partNumbering, S.partLabel, part_n)
    if is_typst then
      out:insert(raw("#part-page(number: " .. (number and typst_str(number) or "none")
        .. ", title: " .. typst_content(b.content) .. ")"))
    else
      out:insert(epub_heading(1, number, b.content, "part", "part-number"))
    end
    return
  end
  if level == chapter_level then
    chapter_n = chapter_n + 1
    boundary()
    expect_epigraph = "chapter"
    local number = number_label(S.chapterNumbering, S.chapterLabel, chapter_n)
    if is_typst then
      out:insert(raw("#chapter-opener(level: " .. chapter_out_level() .. ", number: "
        .. (number and typst_str(number) or "none") .. ", title: " .. typst_content(b.content) .. ")"))
    else
      out:insert(epub_heading(chapter_out_level(), number, b.content, "chapter", "chapter-number"))
    end
    return
  end
  if scene_level > 0 and level == scene_level then
    expect_epigraph = nil
    if S.sceneHeadings == "break" then
      if in_prose then pending_break = true end
    elseif S.sceneHeadings == "show" then
      boundary()
      -- Listed in the contents only when its depth is set to include scene titles.
      local listed = (S.tocDepth or 2) >= 3
      if is_typst then
        out:insert(raw("#scene-title(level: " .. (chapter_out_level() + 1) .. ", outlined: " .. tostring(listed)
          .. ", " .. typst_content(b.content) .. ")"))
      else
        out:insert(pandoc.Header(chapter_out_level() + 1, b.content,
          { class = "scene unnumbered" .. (listed and "" or " unlisted") }))
      end
    end
    return
  end
  -- Any other heading inside the story: kept, below the chapter's level.
  expect_epigraph = nil
  b.level = math.min(6, chapter_out_level() + 1 + math.max(0, level - chapter_level - 1))
  b.classes:insert("unnumbered")
  b.classes:insert("unlisted")
  emit(b)
  boundary()
end

function Pandoc(doc)
  local blocks = doc.blocks
  if part_level > 0 then
    for _, b in ipairs(blocks) do
      if b.t == "Header" and b.level == part_level then
        has_parts = true
        break
      end
    end
  end

  local i = 1
  while i <= #blocks do
    local b = blocks[i]
    local t = b.t
    if t == "Header" then
      header(b)
    elseif t == "Div" and b.classes:includes("bookx-matter") then
      matter(b)
      expect_epigraph = nil
    elseif t == "Div" and b.classes:includes("bookx-main") then
      boundary()
      if is_typst then out:insert(raw("#main-matter()")) end
    elseif t == "Div" and b.classes:includes("bookx-back") then
      boundary()
      if is_typst then out:insert(raw("#back-matter()")) end
    elseif t == "Div" and b.classes:includes("bookx-end") then
      pending_break = false
      if cfg.endMark == "ornament" or cfg.endMark == "text" then
        if is_typst then
          out:insert(raw("#end-mark()"))
        else
          local mark = cfg.endMark == "text" and cfg.endMarkText or cfg.sceneBreakGlyph
          if mark == nil or mark == "" then mark = "\u{2042}" end
          out:insert(pandoc.Div({ pandoc.Para({ pandoc.Str(mark) }) }, { class = "end-mark" }))
        end
      end
      boundary()
    elseif t == "HorizontalRule" or is_break_para(b) then
      expect_epigraph = nil
      if in_prose then pending_break = true end
    elseif t == "BlockQuote" and expect_epigraph and S.epigraphs ~= false then
      local rendered
      rendered, i = epigraph(blocks, i, expect_epigraph)
      out:extend(rendered)
      expect_epigraph = nil
      in_prose = false
    else
      expect_epigraph = nil
      emit(b)
    end
    i = i + 1
  end

  return pandoc.Pandoc(out, doc.meta)
end
