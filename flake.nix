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
      # Claude Code (Construct's Claude agent runs it) is unfree.
      unfreePkgs =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfreePredicate = pkg: nixpkgs.lib.getName pkg == "claude-code";
        };
    in
    {
      # book-exporter and the agents it pins, from any nixpkgs (the NixOS
      # module uses the system's).
      lib.packagesFor =
        pkgs:
        let
          claude-agent-acp = pkgs.callPackage ./nix/claude-agent-acp.nix { };
          pi-acp = pkgs.callPackage ./nix/pi-acp.nix { };
        in
        {
          inherit claude-agent-acp pi-acp;
          book-exporter = pkgs.callPackage ./nix/package.nix { inherit claude-agent-acp pi-acp; };
        };

      packages = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ] (
        system:
        let
          p = self.lib.packagesFor (unfreePkgs system);
        in
        p // { default = p.book-exporter; }
      );

      nixosModules.default = import ./nix/module.nix { inherit self; };

      devShells = forAllSystems (
        pkgs:
        let
          # The export's tools and fonts (nix/deps.nix), as the package pins them.
          deps = import ./nix/deps.nix pkgs;
          fontPath = pkgs.lib.makeSearchPathOutput "out" "share/fonts" deps.fonts;
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.nodejs_24 ] ++ deps.tools;
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
