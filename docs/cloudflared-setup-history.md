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

## Notes for future
- If you rotate tunnel credentials, update `credentials-file` in `~/.cloudflared/config.yml`.
- Keep the process alive (systemd or `tmux`/`screen`) so the site stays reachable.
- Remove the installer after setup: `rm ./cloudflared.deb`.

## Run as a systemd service (Linux)
To keep the tunnel up without a manual shell:
1) Copy config and credentials to a root-readable location:
   - `sudo mkdir -p /usr/local/etc/cloudflared`
   - `sudo cp ~/.cloudflared/* /usr/local/etc/cloudflared/`
2) Update `/usr/local/etc/cloudflared/config.yml` to use absolute paths:
   ```
   tunnel: portal-tunnel
   credentials-file: /usr/local/etc/cloudflared/a5fb382a-8fac-4bf7-84e2-d3d300167f50.json

   ingress:
   - hostname: portal.myrealestateportal.org
     service: http://127.0.0.1:3000
   - service: http_status:404
   ```
3) Install the service pointing at that config:
   - `sudo cloudflared --config /usr/local/etc/cloudflared/config.yml service install`
4) Start/enable and check status:
   - `sudo systemctl enable --now cloudflared`
   - `systemctl status cloudflared`
   - `journalctl -u cloudflared -f` for logs
5) When updating config, edit `/usr/local/etc/cloudflared/config.yml` and `sudo systemctl restart cloudflared`.
