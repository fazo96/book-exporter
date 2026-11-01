# services.book-exporter: book-exporter as a systemd service. Construct's
# agents run as `user` with its home, so they find its Claude Code login and
# pi settings.
{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.book-exporter;
in
{
  options.services.book-exporter = {
    enable = lib.mkEnableOption "book-exporter, which turns markdown books into EPUB and PDF";

    package = lib.mkOption {
      type = lib.types.package;
      default = (self.lib.packagesFor pkgs).book-exporter;
      defaultText = lib.literalExpression "book-exporter built with the system's nixpkgs";
      description = "The book-exporter package.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = "Address to listen on.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3400;
      description = "Port to listen on.";
    };

    dataDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/book-exporter";
      description = "The library: books, their versions, Construct's state (BOOKX_DIR).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "book-exporter";
      description = "User to run as. `book-exporter` is created when left as is.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "book-exporter";
      description = "Group to run as. `book-exporter` is created when left as is.";
    };

    environment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = {
        BOOKX_AI = "off";
      };
      description = "Extra environment variables.";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "File with secrets such as ANTHROPIC_API_KEY, kept out of the store.";
    };
  };

  config = lib.mkIf cfg.enable {
    users.users = lib.mkIf (cfg.user == "book-exporter") {
      book-exporter = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
      };
    };
    users.groups = lib.mkIf (cfg.group == "book-exporter") { book-exporter = { }; };

    systemd.tmpfiles.settings."10-book-exporter" = {
      ${cfg.dataDir}.d = {
        inherit (cfg) user group;
        mode = "0750";
      };
    };

    systemd.services.book-exporter = {
      description = "book-exporter";
      wantedBy = [ "multi-user.target" ];
      after = [ "network.target" ];
      unitConfig.RequiresMountsFor = [ cfg.dataDir ];

      environment = {
        BOOKX_DIR = cfg.dataDir;
        BOOKX_INTERNAL_URL = "http://127.0.0.1:${toString cfg.port}";
      }
      // cfg.environment;

      serviceConfig = {
        ExecStart = "${lib.getExe cfg.package} --hostname ${cfg.host} --port ${toString cfg.port}";
        User = cfg.user;
        Group = cfg.group;
        EnvironmentFile = lib.mkIf (cfg.environmentFile != null) cfg.environmentFile;
        Restart = "on-failure";
        RestartSec = 5;
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "full";
      };
    };
  };
}
