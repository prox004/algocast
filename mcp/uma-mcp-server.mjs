#!/usr/bin/env node

/**
 * UMA Protocol MCP Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Model Context Protocol server that exposes UMA dispute resolution tools.
 *
 * This MCP server provides tools for:
 *   - Proposing resolutions via UMA
 *   - Raising disputes within the 10-min window
 *   - Casting admin votes on disputed resolutions
 *   - Querying UMA resolution status
 *   - Checking time remaining in dispute/voting windows
 *
 * Protocol: UMA-style optimistic oracle on Algorand TestNet
 * Network: TestNet (no bonds, no rewards)
 * Dispute window: 10 minutes
 * Voting period: 10 minutes
 * Finality: Permanent lock (immutable, even admin cannot change)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.ALGOCAST_API_URL || 'http://localhost:4000';

// ── Helper: API Request ──────────────────────────────────────────────────────

async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { status: 0, ok: false, data: { error: err.message } };
  }
}

async function adminRequest(path, token, options = {}) {
  return apiRequest(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'uma-protocol',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'uma_propose_resolution',
      description:
        'Propose a market resolution via UMA Protocol. Creates a 10-minute dispute window. If no dispute is raised, the outcome auto-locks permanently. Requires admin JWT token.',
      inputSchema: {
        type: 'object',
        properties: {
          admin_token: {
            type: 'string',
            description: 'Admin JWT bearer token',
          },
          market_id: {
            type: 'string',
            description: 'ID of the market to resolve',
          },
          outcome: {
            type: 'number',
            enum: [0, 1],
            description: '0 = NO wins, 1 = YES wins',
          },
          evidence: {
            type: 'string',
            description: 'Evidence/reasoning for the proposed resolution',
          },
        },
        required: ['admin_token', 'market_id', 'outcome', 'evidence'],
      },
    },
    {
      name: 'uma_raise_dispute',
      description:
        'Raise a dispute against a proposed UMA resolution. Must be within the 10-minute dispute window. No bond required (testnet). Transitions to admin voting phase (10 min). Requires user JWT token.',
      inputSchema: {
        type: 'object',
        properties: {
          user_token: {
            type: 'string',
            description: 'User JWT bearer token',
          },
          market_id: {
            type: 'string',
            description: 'ID of the market with the proposed resolution',
          },
          reason: {
            type: 'string',
            description: 'Reason for disputing the proposed resolution',
          },
        },
        required: ['user_token', 'market_id', 'reason'],
      },
    },
    {
      name: 'uma_cast_vote',
      description:
        'Cast an admin vote on a disputed UMA resolution. Each admin gets one vote (0=NO, 1=YES). Auto-finalizes when all admins vote or voting period ends. Requires admin JWT token.',
      inputSchema: {
        type: 'object',
        properties: {
          admin_token: {
            type: 'string',
            description: 'Admin JWT bearer token',
          },
          resolution_id: {
            type: 'string',
            description: 'ID of the UMA resolution to vote on',
          },
          vote: {
            type: 'number',
            enum: [0, 1],
            description: '0 = NO, 1 = YES',
          },
        },
        required: ['admin_token', 'resolution_id', 'vote'],
      },
    },
    {
      name: 'uma_get_resolution',
      description:
        'Get the UMA resolution status for a specific market. Returns proposal details, dispute info, votes, time remaining, and lock status.',
      inputSchema: {
        type: 'object',
        properties: {
          market_id: {
            type: 'string',
            description: 'Market ID to check UMA status for',
          },
        },
        required: ['market_id'],
      },
    },
    {
      name: 'uma_get_time_remaining',
      description:
        'Get the time remaining in the current UMA phase (dispute window or voting period) for a market.',
      inputSchema: {
        type: 'object',
        properties: {
          market_id: {
            type: 'string',
            description: 'Market ID to check time for',
          },
        },
        required: ['market_id'],
      },
    },
    {
      name: 'uma_list_active',
      description:
        'List all active (non-locked) UMA resolutions that need attention. Requires admin JWT token.',
      inputSchema: {
        type: 'object',
        properties: {
          admin_token: {
            type: 'string',
            description: 'Admin JWT bearer token',
          },
        },
        required: ['admin_token'],
      },
    },
    {
      name: 'uma_list_all',
      description:
        'List all UMA resolutions across all markets. Optionally filter by status. Requires admin JWT token.',
      inputSchema: {
        type: 'object',
        properties: {
          admin_token: {
            type: 'string',
            description: 'Admin JWT bearer token',
          },
          status: {
            type: 'string',
            enum: ['PROPOSED', 'UMA_VOTING', 'UMA_LOCKED', 'EXPIRED_NO_DISPUTE'],
            description: 'Optional status filter',
          },
        },
        required: ['admin_token'],
      },
    },
  ],
}));

// ── Tool Handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'uma_propose_resolution': {
      const res = await adminRequest('/admin/uma/propose', args.admin_token, {
        method: 'POST',
        body: JSON.stringify({
          market_id: args.market_id,
          outcome: args.outcome,
          evidence: args.evidence,
        }),
      });
      return {
        content: [
          {
            type: 'text',
            text: res.ok
              ? `✅ UMA Resolution Proposed\n\n` +
                `Market: ${args.market_id}\n` +
                `Proposed Outcome: ${args.outcome === 1 ? 'YES' : 'NO'}\n` +
                `Status: ${res.data.uma_resolution?.status}\n` +
                `Dispute Window Ends: ${new Date(res.data.uma_resolution?.dispute_window_ends).toISOString()}\n` +
                `Time Remaining: ${Math.round((res.data.uma_resolution?.dispute_time_remaining_ms || 0) / 1000)}s\n\n` +
                `⚡ Rules:\n` +
                `- Dispute window: 10 minutes\n` +
                `- No bond required (testnet)\n` +
                `- If no dispute → auto-locked permanently\n` +
                `- If disputed → 10-min admin voting\n` +
                `- Final verdict is IMMUTABLE`
              : `❌ Failed: ${res.data.error}`,
          },
        ],
      };
    }

    case 'uma_raise_dispute': {
      const res = await apiRequest(`/dispute/${args.market_id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${args.user_token}` },
        body: JSON.stringify({ reason: args.reason }),
      });
      return {
        content: [
          {
            type: 'text',
            text: res.ok
              ? `⚠️ UMA Dispute Raised\n\n` +
                `Market: ${args.market_id}\n` +
                `Status: ${res.data.uma_resolution?.status}\n` +
                `Voting Ends: ${res.data.uma_resolution?.voting_ends ? new Date(res.data.uma_resolution.voting_ends).toISOString() : 'N/A'}\n` +
                `Reason: ${args.reason}\n\n` +
                `Admin voting period has started (10 minutes).`
              : `❌ Failed: ${res.data.error}`,
          },
        ],
      };
    }

    case 'uma_cast_vote': {
      const res = await adminRequest('/admin/uma/vote', args.admin_token, {
        method: 'POST',
        body: JSON.stringify({
          resolution_id: args.resolution_id,
          vote: args.vote,
        }),
      });
      return {
        content: [
          {
            type: 'text',
            text: res.ok
              ? `🗳️ Vote Cast: ${args.vote === 1 ? 'YES' : 'NO'}\n\n` +
                `Tally: YES=${res.data.tally?.yes_votes}, NO=${res.data.tally?.no_votes} (${res.data.tally?.total_votes} total)\n` +
                `Status: ${res.data.resolution?.status}\n` +
                (res.data.resolution?.is_locked
                  ? `\n🔒 LOCKED! Final outcome: ${res.data.resolution.final_outcome === 1 ? 'YES' : 'NO'}\nThis verdict is PERMANENT and IMMUTABLE.`
                  : `\nVoting still in progress...`)
              : `❌ Failed: ${res.data.error}`,
          },
        ],
      };
    }

    case 'uma_get_resolution': {
      const res = await apiRequest(`/dispute/${args.market_id}/uma`);
      if (!res.ok) {
        return { content: [{ type: 'text', text: `❌ Failed: ${res.data.error}` }] };
      }
      if (!res.data.uma_active) {
        return { content: [{ type: 'text', text: `No UMA resolution found for market ${args.market_id}` }] };
      }
      const uma = res.data.uma_resolution;
      let text = `⚖️ UMA Resolution — ${args.market_id}\n\n`;
      text += `Status: ${uma.status}\n`;
      text += `Proposed Outcome: ${uma.proposed_outcome === 1 ? 'YES' : 'NO'}\n`;
      text += `Proposed By: ${uma.proposed_by}\n`;
      text += `Evidence: ${uma.evidence || 'N/A'}\n`;
      text += `Proposed At: ${new Date(uma.proposed_at).toISOString()}\n`;

      if (uma.status === 'PROPOSED') {
        text += `\n⏰ Dispute Window: ${Math.round(uma.dispute_time_remaining_ms / 1000)}s remaining\n`;
        text += `Ends: ${new Date(uma.dispute_window_ends).toISOString()}\n`;
      }
      if (uma.status === 'UMA_VOTING') {
        text += `\n🗳️ Voting Period: ${Math.round(uma.voting_time_remaining_ms / 1000)}s remaining\n`;
        text += `Ends: ${uma.voting_ends ? new Date(uma.voting_ends).toISOString() : 'N/A'}\n`;
        text += `Dispute Reason: ${uma.dispute_reason}\n`;
        text += `Votes: YES=${uma.votes.yes}, NO=${uma.votes.no} (${uma.votes.total} total)\n`;
      }
      if (uma.is_locked) {
        text += `\n🔒 PERMANENTLY LOCKED\n`;
        text += `Final Outcome: ${uma.final_outcome === 1 ? 'YES' : 'NO'}\n`;
        text += `Locked At: ${uma.locked_at ? new Date(uma.locked_at).toISOString() : 'N/A'}\n`;
        text += `Lock Hash: ${uma.lock_hash}\n`;
        text += `⚠️ This verdict is IMMUTABLE — not even admins can change it.\n`;
      }

      return { content: [{ type: 'text', text }] };
    }

    case 'uma_get_time_remaining': {
      const res = await apiRequest(`/dispute/${args.market_id}/time`);
      return {
        content: [
          {
            type: 'text',
            text: res.ok
              ? `⏰ ${args.market_id}\n` +
                `Phase: ${res.data.phase || 'None'}\n` +
                `Time Remaining: ${res.data.time_remaining_formatted || '0:00'}\n` +
                `Status: ${res.data.status || 'N/A'}`
              : `❌ Failed: ${res.data.error}`,
          },
        ],
      };
    }

    case 'uma_list_active': {
      const res = await adminRequest('/admin/uma/active', args.admin_token);
      if (!res.ok) {
        return { content: [{ type: 'text', text: `❌ Failed: ${res.data.error}` }] };
      }
      if (res.data.count === 0) {
        return { content: [{ type: 'text', text: 'No active UMA resolutions.' }] };
      }
      let text = `⚡ Active UMA Resolutions (${res.data.count})\n\n`;
      for (const r of res.data.resolutions) {
        text += `• ${r.market_id} — ${r.status}\n`;
        if (r.status === 'PROPOSED') {
          text += `  Dispute window: ${Math.round(r.dispute_time_remaining_ms / 1000)}s\n`;
        }
        if (r.status === 'UMA_VOTING') {
          text += `  Voting: ${Math.round(r.voting_time_remaining_ms / 1000)}s remaining\n`;
        }
      }
      return { content: [{ type: 'text', text }] };
    }

    case 'uma_list_all': {
      const query = args.status ? `?status=${args.status}` : '';
      const res = await adminRequest(`/admin/uma/resolutions${query}`, args.admin_token);
      if (!res.ok) {
        return { content: [{ type: 'text', text: `❌ Failed: ${res.data.error}` }] };
      }
      let text = `📋 UMA Resolutions (${res.data.count})\n\n`;
      for (const r of res.data.resolutions) {
        const locked = r.is_locked ? '🔒' : '⏳';
        text += `${locked} ${r.market_id} — ${r.status}`;
        if (r.final_outcome !== null && r.final_outcome !== undefined) {
          text += ` → ${r.final_outcome === 1 ? 'YES' : 'NO'}`;
        }
        text += '\n';
      }
      return { content: [{ type: 'text', text }] };
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[UMA MCP] Server started');
}

main().catch((err) => {
  console.error('[UMA MCP] Fatal:', err);
  process.exit(1);
});
