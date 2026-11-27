// A site's MCP server: what a site hands out and what an agent connects to, and how its tools present abilities.
// It has its own file because sites, agents, checks and the server checks all need it, and none should depend on another.

/** A tool that runs any ability it is given by name. */
export interface RunTool {
  tool: string;
  /** The argument of the tool that names the ability, as a pack lists it. */
  nameArgument: string;
  /** The argument of the tool that holds the ability's input. Where an ability is a tool, the tool's input is the ability's. */
  inputArgument: string;
  /**
   * Optional ability-name prefix routed through this tool on a hybrid server (such as `remote:`). When set,
   * only listed abilities with that prefix are treated as behind lookup; when omitted, an active run tool
   * routes any listed ability not exposed directly.
   */
  prefix?: string;
}

/**
 * The tools of an MCP server that find, describe and run abilities, in place of a tool per ability. The
 * checks need them to tell which ability a tool call ran, and with which arguments.
 */
export interface LookupTools {
  /** The tools that run any ability. A server may have several, each naming its arguments in its own way. */
  runTools: RunTool[];
  /** The tools that find and describe abilities. Calling one runs no ability. */
  otherTools: string[];
}

export interface McpServer {
  /** The name the agent knows the server by. Tool names carry it, so checks can tell its calls from others. */
  name: string;
  url: string;
  /**
   * Optional address used only by server checks (MCP Inspector), when `url` routes clients by client identity
   * and requires an explicit route or query parameter to inspect the same surface agents see.
   */
  inspectUrl?: string;
  /** Sent with every request, for example Authorization. */
  headers: Record<string, string>;
  /**
   * Its lookup tools, when it can have them. Every other tool of the server is an ability, named after it
   * with `/` written as `-`. So the checks read a server with lookup tools, one with a tool per ability,
   * and one with both, without being told which it is.
   */
  lookup?: LookupTools;
}

/** The name of the tool that presents an ability as a tool of its own: the ability's name with `/` written as `-`. */
export function toolOf(ability: string): string {
  return ability.replaceAll('/', '-');
}

/** Every lookup tool of a server: those that run any ability, and those that find and describe abilities. */
export function lookupToolNames(lookup: LookupTools | undefined): string[] {
  return lookup === undefined ? [] : [...lookup.runTools.map((one) => one.tool), ...lookup.otherTools];
}
