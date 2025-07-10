# Fresh House Discord MCP Server

Discord MCP server for Fresh House Network event management and automation.

## Features

- **Event Management**: Create, edit, RSVP tracking, notifications
- **Content Distribution**: Announcements, blog posts, social content
- **Referral Tracking**: URL tracking with user referral variables
- **Calendar Sync**: Discord ↔ Google Calendar ↔ HighLevel integration
- **Webhook Integration**: n8n workflow triggers and automation

## Environment Variables

Required environment variables (already configured in Railway):
- `DISCORD_BOT_TOKEN` - Discord bot authentication
- `N8N_API_KEY` - n8n workflow integration
- `N8N_API_URL` - n8n server endpoint
- `SUPABASE_URL` - Database connection
- `SUPABASE_SERVICE_KEY` - Database authentication

## Deployment

Deployed to Railway in the Ascension Engine project as part of the Fresh House Agent Factory architecture.

## Integration Points

- **n8n Workflows**: Receives commands and sends events
- **Supabase**: Event transcripts and artifacts storage
- **Google Calendar**: Event synchronization
- **HighLevel**: Calendar and notification integration
