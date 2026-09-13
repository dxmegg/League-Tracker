import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A fresh Client is created per call because the OP.GG MCP server is stateless
// for this tool, and a long-lived client would need reconnect handling we do
// not want to maintain for an experiment.
export async function fetchSummonerGameHistory(
  gameName: string,
  tagLine: string,
  region: string,
): Promise<unknown> {
  const client = new Client({ name: "league-tracker", version: "1.0.0" });
  try {
    const transport = new StreamableHTTPClientTransport(new URL("https://mcp-api.op.gg/mcp"));
    await client.connect(transport);
    // Tool names now use the lol_list_* / lol_get_* scheme, and
    // desired_output_fields is mandatory for most tools; omitting it produces
    // a validation error rather than a partial response. OP.GG MCP expects a
    // path expression, not a wildcard: ["*"] returns the schema itself, while
    // field paths use data. as the root and {a,b,c} for sibling fields.
    const result = await client.callTool({
      name: "lol_list_summoner_matches",
      arguments: {
        game_name: gameName,
        tag_line: tagLine,
        region,
        desired_output_fields: "data.game_history.{id,created_at,game_map,game_type,game_length_second}",
      },
    });
    return result;
  } finally {
    try {
      await client.close();
    } catch (err) {
      console.error("[mcp] Failed to close client:", err);
    }
  }
}
