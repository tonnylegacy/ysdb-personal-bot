# YSDB Personal Bot

Standalone local bot repo for:

- importing WhatsApp chat exports
- scoring warm leads and IB prospects
- drafting personal invite messages
- running a Telegram bot for opted-in contacts
- drafting daily YSDB result messages
- reviewing everything in a local admin page

## Commands

- `node src/cli.js setup`
- `node src/cli.js ingest [file]`
- `node src/cli.js leads`
- `node src/cli.js draft-invites`
- `node src/cli.js draft-result [file]`
- `node src/cli.js tasks`
- `node src/admin-server.js`
- `node src/bot.js`

## Quick start

1. Run `node src/cli.js setup`
2. Edit `.env`
3. Put a real exported WhatsApp `.txt` file in `imports/whatsapp/`
4. Run `node src/cli.js ingest`
5. Run `node src/admin-server.js`
6. Open `http://127.0.0.1:8787`

## Notes

- This repo is isolated from the website repo.
- Website facts were manually encoded into the knowledge base; no website assets are reused here.
- Telegram DMs only work for contacts who start your bot first.
