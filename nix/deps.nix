# What the export needs at run time, shared by the dev shell and the package.
pkgs: {
  # The faces a book can be set in. lib/fonts.ts lists them by family name
  # and finds their files under BOOKX_FONT_PATHS: add one in both places.
  fonts = [
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
  tools = [
    pkgs.pandoc
    pkgs.typst
    pkgs.epubcheck
    pkgs.resvg
    pkgs.imagemagick
    pkgs.zip
    pkgs.unzip
    pkgs.poppler-utils
  ];
}
