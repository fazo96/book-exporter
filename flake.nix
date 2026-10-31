{
  description = "book-exporter: turn markdown books into EPUB and PDF";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      # The faces a book can be set in. lib/fonts.ts lists them by family name
      # and finds their files under BOOKX_FONT_PATHS: add one in both places.
      fontsFor = pkgs: [
        pkgs.eb-garamond
        pkgs.crimson-pro
        pkgs.libre-baskerville
        pkgs.libre-caslon
        pkgs.lora
        pkgs.literata
        pkgs.source-serif
        pkgs.alegreya
        pkgs.cormorant
        pkgs.spectral
        pkgs.vollkorn
        pkgs.gentium-plus
        pkgs.merriweather
        pkgs.jost
        pkgs.source-sans
        pkgs.ibm-plex
      ];

      # The export pipeline: pandoc (with the Lua filters) writes the EPUB and
      # the Typst source, typst sets the PDF, epubcheck validates the EPUB,
      # resvg rasterizes SVG covers, imagemagick makes the store JPEG, zip/unzip
      # patch the packaged EPUB, poppler counts the PDF's pages.
      toolsFor = pkgs: [
        pkgs.pandoc
        pkgs.typst
        pkgs.epubcheck
        pkgs.resvg
        pkgs.imagemagick
        pkgs.zip
        pkgs.unzip
        pkgs.poppler-utils
      ];
    in
    {
      devShells = forAllSystems (
        pkgs:
        let
          fontPath = pkgs.lib.makeSearchPathOutput "out" "share/fonts" (fontsFor pkgs);
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 ] ++ toolsFor pkgs;
            # Typst finds fonts through TYPST_FONT_PATHS; the app passes the same
            # folders to Typst itself and looks up EPUB font files in them.
            BOOKX_FONT_PATHS = fontPath;
            TYPST_FONT_PATHS = fontPath;
            shellHook = ''
              export PATH="$PWD/node_modules/.bin:$PATH"
            '';
          };
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-rfc-style);
    };
}
