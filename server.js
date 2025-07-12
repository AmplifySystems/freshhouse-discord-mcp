// Fresh House Discord MCP Server
// Custom implementation with SSE endpoints for n8n integration

import express from 'express';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = process.env.PORT || 8080;

// Environment variables
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'vMHaXJCe$lUv3i&muA7CZiaDxbxCZBk6bVQw3M278oN!o0I5s37$J3';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Initialize Supabase client (if configured)
let supabase;
if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

// Initialize Discord client
const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// Middleware
app.use(cors());
app.use(express.json());

// Authentication middleware
function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Missing or invalid authorization header',
      expected: 'Bearer <token>'
    });
  }
  
  const token = authHeader.substring(7);
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// ==========================================
// SSE ENDPOINT FOR N8N MCP CLIENT
// ==========================================
app.get('/sse', authenticateRequest, (req, res) => {
  console.log('n8n MCP Client connecting via SSE from:', req.ip);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization'
  });

  // Send initial connection event
  res.write(`data: ${JSON.stringify({
    type: 'connection',
    timestamp: new Date().toISOString(),
    message: 'Fresh House Discord MCP Server connected',
    status: 'ready'
  })}\n\n`);

  // Send available tools
  res.write(`data: ${JSON.stringify({
    type: 'tools_available',
    tools: [
      'send_discord_message',
      'get_discord_channels', 
      'get_discord_messages',
      'manage_discord_roles',
      'sync_to_supabase'
    ],
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({
      type: 'heartbeat',
      timestamp: new Date().toISOString(),
      discord_status: discord.isReady() ? 'connected' : 'disconnected'
    })}\n\n`);
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    console.log('n8n MCP Client disconnected');
    clearInterval(heartbeat);
  });
});

// ==========================================
// MCP TOOLS ENDPOINTS
// ==========================================

// Get available tools
app.get('/tools', authenticateRequest, (req, res) => {
  const tools = [
    {
      name: 'send_discord_message',
      description: 'Send a message to a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'Discord channel ID' },
          message: { type: 'string', description: 'Message content to send' },
          embed: { type: 'object', description: 'Optional embed object' }
        },
        required: ['channel_id', 'message']
      }
    },
    {
      name: 'get_discord_channels',
      description: 'List available Discord channels',
      inputSchema: {
        type: 'object',
        properties: {
          guild_id: { type: 'string', description: 'Discord server ID (optional)' }
        }
      }
    },
    {
      name: 'get_discord_messages',
      description: 'Get recent messages from a Discord channel',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: { type: 'string', description: 'Discord channel ID' },
          limit: { type: 'number', description: 'Number of messages (default: 10)' }
        },
        required: ['channel_id']
      }
    },
    {
      name: 'manage_discord_roles',
      description: 'Add or remove roles from Discord users',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: { type: 'string', description: 'Discord user ID' },
          role_id: { type: 'string', description: 'Discord role ID' },
          action: { type: 'string', enum: ['add', 'remove'] }
        },
        required: ['user_id', 'role_id', 'action']
      }
    },
    {
      name: 'sync_to_supabase',
      description: 'Sync Discord data to Supabase database',
      inputSchema: {
        type: 'object',
        properties: {
          data_type: { type: 'string', enum: ['user', 'message', 'event'] },
          data: { type: 'object', description: 'Data to sync' },
          client_id: { type: 'string', description: 'Client ID for partitioning' }
        },
        required: ['data_type', 'data', 'client_id']
      }
    }
  ];
  
  res.json({ tools });
});

// Execute tool
app.post('/execute', authenticateRequest, async (req, res) => {
  try {
    const { tool_name, parameters } = req.body;
    console.log(`Executing tool: ${tool_name}`, parameters);
    
    let result;
    switch (tool_name) {
      case 'send_discord_message':
        result = await sendDiscordMessage(parameters);
        break;
      case 'get_discord_channels':
        result = await getDiscordChannels(parameters);
        break;
      case 'get_discord_messages':
        result = await getDiscordMessages(parameters);
        break;
      case 'manage_discord_roles':
        result = await manageDiscordRoles(parameters);
        break;
      case 'sync_to_supabase':
        result = await syncToSupabase(parameters);
        break;
      default:
        throw new Error(`Unknown tool: ${tool_name}`);
    }
    
    res.json({ success: true, result });
  } catch (error) {
    console.error('Tool execution error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==========================================
// DISCORD TOOL IMPLEMENTATIONS
// ==========================================

async function sendDiscordMessage(params) {
  const { channel_id, message, embed } = params;
  
  if (!discord.isReady()) {
    throw new Error('Discord bot is not connected');
  }
  
  const channel = await discord.channels.fetch(channel_id);
  if (!channel) {
    throw new Error(`Channel ${channel_id} not found`);
  }
  
  let sentMessage;
  if (embed) {
    const embedObj = new EmbedBuilder(embed);
    sentMessage = await channel.send({ content: message, embeds: [embedObj] });
  } else {
    sentMessage = await channel.send(message);
  }
  
  return {
    message_id: sentMessage.id,
    channel_id: channel_id,
    content: message,
    timestamp: sentMessage.createdAt.toISOString(),
    status: 'sent'
  };
}

async function getDiscordChannels(params) {
  if (!discord.isReady()) {
    throw new Error('Discord bot is not connected');
  }
  
  const guild = discord.guilds.cache.first();
  if (!guild) {
    throw new Error('No Discord server found');
  }
  
  const channels = guild.channels.cache
    .filter(channel => channel.type === 0) // Text channels
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      type: 'text',
      position: channel.position
    }));
  
  return {
    guild_id: guild.id,
    guild_name: guild.name,
    channels: channels,
    count: channels.length
  };
}

async function getDiscordMessages(params) {
  const { channel_id, limit = 10 } = params;
  
  if (!discord.isReady()) {
    throw new Error('Discord bot is not connected');
  }
  
  const channel = await discord.channels.fetch(channel_id);
  if (!channel) {
    throw new Error(`Channel ${channel_id} not found`);
  }
  
  const messages = await channel.messages.fetch({ limit });
  const messageArray = messages.map(msg => ({
    id: msg.id,
    content: msg.content,
    author: {
      id: msg.author.id,
      username: msg.author.username,
      display_name: msg.author.displayName
    },
    timestamp: msg.createdAt.toISOString(),
    attachments: msg.attachments.size
  }));
  
  return {
    channel_id: channel_id,
    messages: messageArray,
    count: messageArray.length
  };
}

async function manageDiscordRoles(params) {
  const { user_id, role_id, action } = params;
  
  if (!discord.isReady()) {
    throw new Error('Discord bot is not connected');
  }
  
  const guild = discord.guilds.cache.first();
  const member = await guild.members.fetch(user_id);
  const role = await guild.roles.fetch(role_id);
  
  if (!member) throw new Error(`User ${user_id} not found`);
  if (!role) throw new Error(`Role ${role_id} not found`);
  
  if (action === 'add') {
    await member.roles.add(role);
  } else if (action === 'remove') {
    await member.roles.remove(role);
  }
  
  return {
    user_id: user_id,
    role_id: role_id,
    action: action,
    status: 'completed'
  };
}

async function syncToSupabase(params) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }
  
  const { data_type, data, client_id } = params;
  const table_name = `${client_id}_discord_${data_type}`;
  
  const { data: result, error } = await supabase
    .from(table_name)
    .insert({
      ...data,
      synced_at: new Date().toISOString()
    });
  
  if (error) throw new Error(`Supabase sync failed: ${error.message}`);
  
  return {
    synced: true,
    table: table_name,
    client_id: client_id,
    data_type: data_type
  };
}

// ==========================================
// HEALTH & STATUS ENDPOINTS
// ==========================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'freshhouse-discord-mcp',
    discord: {
      connected: discord.isReady(),
      guilds: discord.guilds.cache.size
    },
    endpoints: {
      '/sse': 'available',
      '/tools': 'available',
      '/execute': 'available'
    },
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Fresh House Discord MCP Server',
    status: 'running',
    discord_connected: discord.isReady(),
    endpoints: ['/health', '/sse', '/tools', '/execute'],
    documentation: 'https://github.com/AmplifySystems/freshhouse-discord-mcp'
  });
});

// ==========================================
// DISCORD CLIENT SETUP
// ==========================================

discord.once('ready', () => {
  console.log(`Discord bot logged in as ${discord.user.tag}`);
  console.log(`Connected to ${discord.guilds.cache.size} server(s)`);
});

discord.on('error', (error) => {
  console.error('Discord client error:', error);
});

// ==========================================
// START SERVER
// ==========================================

// Login to Discord
if (DISCORD_BOT_TOKEN) {
  discord.login(DISCORD_BOT_TOKEN).catch(console.error);
} else {
  console.warn('DISCORD_BOT_TOKEN not provided - Discord features will not work');
}

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Fresh House Discord MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Public URL: https://discord-mcp-server-production.up.railway.app`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  discord.destroy();
  process.exit(0);
});

export default app;