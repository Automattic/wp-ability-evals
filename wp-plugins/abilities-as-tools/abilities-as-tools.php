<?php
/**
 * Plugin Name: Abilities as MCP Tools
 * Description: Presents each ability that is public for MCP as a tool of its own on the MCP Adapter's default server, in place of the three tools that find, describe and run abilities, and describes the server as the site's own.
 * Version: 0.1.0
 * Requires at least: 6.9
 * Requires PHP: 7.4
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * Needs the MCP Adapter plugin, 0.6.0 or newer. Without it, this plugin does nothing.
 *
 * @package AbilitiesAsTools
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_filter( 'mcp_adapter_default_server_config', 'abilities_as_tools_server_config' );

/**
 * Replaces the default server's tools with one tool per ability, and its name and instructions with ones
 * that say it is the user's WordPress site.
 *
 * The server keeps its address. The Adapter's own name and instructions describe the three tools this
 * plugin takes away. An ability becomes a tool when the MCP Adapter would list it through its own lookup
 * tool: it is public for MCP and its MCP type is `tool`.
 *
 * @since 0.1.0
 *
 * @param array<string, mixed> $config The default server's configuration.
 * @return array<string, mixed> The configuration, with `tools` holding the names of those abilities.
 */
function abilities_as_tools_server_config( array $config ): array {
	$tools = array();
	foreach ( wp_get_abilities() as $ability ) {
		$name = $ability->get_name();
		$meta = $ability->get_meta();
		// The adapter's own abilities are the lookup tools this plugin takes away.
		if ( 0 === strpos( $name, 'mcp-adapter/' ) ) {
			continue;
		}
		if ( 'tool' !== ( $meta['mcp']['type'] ?? 'tool' ) ) {
			continue;
		}
		if ( ! \WP\MCP\Abilities\McpAbilityExposure::is_public( $ability ) ) {
			continue;
		}
		$tools[] = $name;
	}
	$config['tools']              = $tools;
	$config['server_name']        = 'WordPress site';
	$config['server_description'] = "Your WordPress site. Each tool runs one of your site's abilities: use them to answer questions about your site and to make changes to it.";

	return $config;
}
