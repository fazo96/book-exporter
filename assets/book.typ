// book.typ: the functions the PDF is set with (docs/pipeline.md).
//
// lib/build/typst.ts writes book.typ for each export as: a `cfg` dictionary
// with the book's settings, this file, the page and text setup, the project's
// custom.typ, the cover and title pages, then the body pandoc wrote with
// assets/book.lua (which calls the functions below). custom.typ comes after
// these definitions, so it can redefine any of them (`#let scene-break() = …`)
// or add set and show rules; definitions here that call each other keep the
// originals.

// ------------------------------------------------------------------ state
// The running head: the title of the chapter (or section) being read.
#let running = state("bookx-running", none)
// Off in the front matter: no folios and no running heads before the story.
#let in-main = state("bookx-main", false)

// Marks a page that opens a part, chapter or section: no running head there,
// and a silent page (a part page, a front-matter page) carries no folio either.
#let opener(silent: false) = [#metadata(silent) <bookx-opener>]

#let openers-on(p) = query(<bookx-opener>).filter(m => m.location().page() == p)

// A new page, or (for print) a new right-hand page. The blank page that a
// parity break can leave behind carries no folio or running head.
#let open-page() = {
  if cfg.open-recto {
    set page(header: none, footer: none)
    pagebreak(weak: true, to: "odd")
  } else {
    pagebreak(weak: true)
  }
}

// ------------------------------------------------------------- display type
#let display(size: 1em, weight: auto, body) = {
  let b = if cfg.heading-case == "upper" { upper(body) } else if cfg.heading-case == "small-caps" { smallcaps(body) } else { body }
  text(
    font: cfg.heading-font,
    size: size,
    weight: if weight == auto { cfg.heading-weight } else { weight },
    tracking: cfg.heading-tracking,
    hyphenate: false,
    b,
  )
}

#let display-block(body) = {
  set par(justify: false, first-line-indent: 0em)
  align(cfg.heading-align, body)
}

// pandoc's Typst writer draws a `---` that the filter left alone with this.
#let horizontalrule = align(center, line(length: 25%, stroke: 0.4pt))

// ----------------------------------------------------------------- openers
#let part-page(number: none, title: none) = {
  open-page()
  opener(silent: true)
  v(28%)
  display-block[
    #set align(center)
    #block(width: 80%)[
      #if number != none [
        #display(size: 0.9em)[#number]
        #v(0.6em)
      ]
      #display(size: 1.75em)[#heading(level: 1, title)]
    ]
  ]
  v(2.4em)
}

#let chapter-opener(level: 2, number: none, title: none) = {
  open-page()
  opener()
  running.update(title)
  v(18%)
  display-block[
    #if number != none [
      #display(size: 0.85em)[#number]
      #v(0.5em)
    ]
    #display(size: 1.35em)[#heading(level: level, title)]
  ]
  v(2.2em)
}

#let scene-title(level: 3, outlined: false, title) = block(above: 2em, below: 1.2em, display-block[
  #display(size: 1em)[#heading(level: level, outlined: outlined, title)]
])

// ------------------------------------------------------------------ breaks
#let scene-break() = {
  if cfg.scene-break == none {
    v(1.4em)
  } else {
    block(above: 1.3em, below: 1.3em, width: 100%, align(center, text(hyphenate: false, cfg.scene-break)))
  }
}

#let end-mark() = block(above: 2.6em, width: 100%, align(center)[
  #if cfg.end-mark == "text" { display(size: 0.9em, cfg.end-text) } else if cfg.scene-break != none { cfg.scene-break } else { sym.ast.op }
])

// ---------------------------------------------------------------- epigraphs
#let epigraph(where: "chapter", attribution: none, body) = {
  let top = if where == "matter" { 30% } else { 0pt }
  v(top)
  align(center, block(width: 76%, above: 1em, below: 2em)[
    #set par(justify: false, first-line-indent: 0em)
    #set align(center)
    #text(style: "italic", size: 0.96em, body)
    #if attribution != none [
      #v(0.4em)
      #text(size: 0.78em, tracking: 0.12em, upper(attribution))
    ]
  ])
}

// ------------------------------------------------------- front & back matter
#let matter-page(style: "plain", front: true, title: none, outlined: true, body) = {
  let titled = title != none
  if style == "copyright" {
    // The back of the title page: just the next page, never pushed to a right-hand one.
    pagebreak(weak: true)
    opener(silent: true)
    set par(justify: false, first-line-indent: 0em, spacing: 0.9em)
    set text(size: 0.82em)
    v(1fr)
    if titled { display(size: 1em)[#heading(level: 1, outlined: outlined, title)]; v(1em) }
    body
  } else if style == "dedication" or style == "epigraph" {
    open-page()
    opener(silent: true)
    if titled { display-block(display(size: 1.1em)[#heading(level: 1, outlined: outlined, title)]); v(1.2em) }
    set par(justify: false, first-line-indent: 0em)
    if style == "dedication" {
      v(28%)
      align(center, block(width: 76%, body))
    } else {
      body
    }
  } else {
    open-page()
    opener(silent: front)
    if titled { running.update(title) }
    v(18%)
    if titled {
      display-block(display(size: 1.25em)[#heading(level: 1, outlined: outlined, title)])
      v(2em)
    }
    if style == "centered" {
      set par(justify: false, first-line-indent: 0em)
      align(center, body)
    } else {
      body
    }
  }
}

// ---------------------------------------------------------- whole-page parts
#let cover-page() = if cfg.cover != none {
  page(margin: 0pt, header: none, footer: none, image(cfg.cover, width: 100%, height: 100%, fit: "cover"))
}

#let title-page() = page(header: none, footer: none)[
  #set par(justify: false, first-line-indent: 0em)
  #v(30%)
  #align(center)[
    #display(size: 2em)[#cfg.title]
    #if cfg.subtitle != "" [
      #v(0.8em)
      #text(style: "italic", size: 1.15em, cfg.subtitle)
    ]
    #v(2.4em)
    #if cfg.authors != "" { text(size: 1.15em, cfg.authors) }
  ]
  #if cfg.publisher != "" and cfg.publisher != cfg.authors [
    #v(1fr)
    #align(center, text(size: 0.85em, cfg.publisher))
  ]
]

#let contents-page() = {
  open-page()
  opener(silent: true)
  v(12%)
  display-block(display(size: 1.25em)[Contents])
  v(2em)
  set par(justify: false, first-line-indent: 0em)
  show outline.entry.where(level: 1): set block(above: 1.1em)
  outline(title: none, depth: cfg.toc-depth)
}

// Where the story starts: the contents (if asked for), then page 1.
#let main-matter() = {
  if cfg.toc { contents-page() }
  open-page()
  counter(page).update(1)
  in-main.update(true)
}

#let back-matter() = {}

// ------------------------------------------------------------ page furniture
#let folio() = context {
  if not cfg.page-numbers or not in-main.get() { return }
  let here-openers = openers-on(here().page())
  if here-openers.any(m => m.value) { return }
  align(center, text(size: 0.85em, counter(page).display()))
}

#let running-head() = context {
  if cfg.running-heads == "none" or not in-main.get() { return }
  let p = here().page()
  if openers-on(p).len() > 0 { return }
  let (verso, recto) = if cfg.running-heads == "title-chapter" {
    (cfg.title, running.get())
  } else {
    (cfg.authors, cfg.title)
  }
  // Left and right go by the folio (even on the left), not the physical page:
  // the cover and front matter come before page 1.
  let head = if calc.even(counter(page).get().first()) { verso } else { recto }
  if head == none { head = cfg.title }
  set text(size: 0.78em)
  align(center, display(weight: 400)[#head])
}
