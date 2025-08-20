{
  description = "Nix Flake for Clasp Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          name = "clasp-dev-env";

          buildInputs = with pkgs; [
            nodejs
            nodePackages.npm
            google-clasp
          ];

          shellHook = ''
            echo "🚀 Welcome to your Clasp Nix dev shell!"
          '';
        };
      });
}