# book-exporter as `next start` serves it: the build, its node_modules,
# scripts/ (Construct runs scripts/pi-construct and pi-mcp-adapter from there)
# and assets/ (the Lua filter and Typst library the export reads) in
# lib/book-exporter, with the export's tools, fonts and Construct's agents
# pinned in the wrapper. The library comes from BOOKX_DIR: lib/book-exporter
# is read-only.
{
  lib,
  pkgs,
  buildNpmPackage,
  importNpmLock,
  nodejs_24,
  makeWrapper,
  claude-code,
  pi-coding-agent,
  claude-agent-acp,
  pi-acp,
}:

let
  deps = import ./deps.nix pkgs;
  fontPath = lib.makeSearchPathOutput "out" "share/fonts" deps.fonts;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.difference ../. (
      lib.fileset.unions [
        ../nix
        ../flake.nix
        ../flake.lock
        ../tests
        ../docs
        (lib.fileset.maybeMissing ../data)
      ]
    );
  };
in
buildNpmPackage {
  pname = "book-exporter";
  version = (lib.importJSON ../package.json).version;
  inherit src;

  nodejs = nodejs_24;
  npmDeps = importNpmLock { npmRoot = src; };
  npmConfigHook = importNpmLock.npmConfigHook;

  nativeBuildInputs = [ makeWrapper ];

  env.NEXT_TELEMETRY_DISABLED = "1";

  installPhase = ''
    runHook preInstall

    npm prune --omit=dev --no-save
    mkdir -p $out/lib/book-exporter $out/bin
    cp -r .next node_modules scripts assets package.json next.config.ts $out/lib/book-exporter/
    rm -rf $out/lib/book-exporter/.next/cache

    makeWrapper ${lib.getExe nodejs_24} $out/bin/book-exporter \
      --chdir $out/lib/book-exporter \
      --add-flags $out/lib/book-exporter/node_modules/next/dist/bin/next \
      --add-flags start \
      --prefix PATH : ${lib.makeBinPath deps.tools} \
      --set-default NODE_ENV production \
      --set-default NEXT_TELEMETRY_DISABLED 1 \
      --set-default BOOKX_FONT_PATHS ${fontPath} \
      --set-default TYPST_FONT_PATHS ${fontPath} \
      --set-default BOOKX_CLAUDE ${lib.getExe claude-code} \
      --set-default BOOKX_CONSTRUCT_CLAUDE ${lib.getExe claude-agent-acp} \
      --set-default BOOKX_PI ${lib.getExe pi-coding-agent} \
      --set-default BOOKX_CONSTRUCT_PI ${lib.getExe pi-acp}

    runHook postInstall
  '';

  meta = {
    description = "Turn markdown books into EPUB and PDF";
    homepage = "https://github.com/fazo96/book-exporter";
    license = lib.licenses.agpl3Plus;
    mainProgram = "book-exporter";
  };
}
