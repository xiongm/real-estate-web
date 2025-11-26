# Cloudflared setup history (portal.myrealestateportal.org)

A distilled reference of what was done (from shell history) to expose `localhost:3000` at `portal.myrealestateportal.org` using Cloudflare Tunnel.

## One-time setup
1) Install the daemon:
   - `wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -O cloudflared.deb`
   - `sudo dpkg -i cloudflared.deb`
   - `cloudflared --version` (verify install)
2) Authenticate to Cloudflare:
   - `cloudflared tunnel login` (opens browser; run again if needed)

## Create the named tunnel
3) Create and note the credentials file:
   - `cloudflared tunnel create portal-tunnel`
   - Inspect: `ls ~/.cloudflared/*.json`
4) Build the config (moved from JSON to YAML):
     - Start with `vim ~/.cloudflared/config.json`, then `mv ~/.cloudflared/config.json ~/.cloudflared/config.yml`
     - Final config (`~/.cloudflared/config.yml`):
     ```yaml
     tunnel: portal-tunnel
     credentials-file: /home/xiongm/.cloudflared/<tunnel-uuid>.json

     ingress:
     - hostname: portal.myrealestateportal.org
       service: http://localhost:3000
     - service: http_status:404
     ```
   - Validate as needed: `cloudflared tunnel ingress validate --config ~/.cloudflared/config.yml`

## Wire DNS to the tunnel
5) Create the CNAME/route in Cloudflare:
   - `cloudflared tunnel route dns portal-tunnel portal.myrealestateportal.org`

## Run the tunnel
6) Start the daemon for this tunnel (from history, run repeatedly to keep it online):
   - `cloudflared tunnel --config ~/.cloudflared/config.yml run portal-tunnel`
   - Earlier ad-hoc run: `cloudflared tunnel --url http://localhost:3000` (ephemeral, before named tunnel)
7) Useful checks:
   - `cloudflared tunnel list`
   - `pgrep -a cloudflared`
