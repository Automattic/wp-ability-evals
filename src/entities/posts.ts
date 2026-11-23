// Posts, as the evals see them. Keyed by slug; a draft has none until it is published or given one, and a
// draft that starting content creates is given its key as its slug. A post without a slug is keyed by `#`
// and its ID: such a key names a post that is on the site, and nothing can be created under it.

import type { EntityType } from './types.ts';

export const posts: EntityType = {
  name: 'posts',
  fields: ['title', 'status', 'content'],
  readers: {
    'wp-env': `array_map(fn($p) => [
      'key' => $p->post_name ?: '#' . $p->ID, 'title' => $p->post_title, 'status' => $p->post_status,
      'content' => $p->post_content,
    ], get_posts(['post_type' => 'post', 'post_status' => 'any', 'numberposts' => -1]))`,
  },
  writers: {
    // The post is looked for as the reader lists it: by its slug, or by its ID where the key is `#` and a
    // number, which only a post without a slug has for a key. A new post gets its key as its slug, which
    // WordPress keeps for a draft too, so the reader finds it under the same key. A post that was found by
    // its ID is given no slug: it keeps its key until WordPress gives it one, as it does when the post is published.
    'wp-env': `
      $listed = ['post_type' => 'post', 'post_status' => 'any', 'numberposts' => 1];
      $by_id = preg_match('/^#(\\d+)$/', $key, $id) === 1;
      $found = $by_id
        ? array_values(array_filter(get_posts($listed + ['post__in' => [(int) $id[1]]]), fn($p) => $p->post_name === ''))
        : get_posts($listed + ['name' => $key]);
      if ($fields === 'removed') {
        if (!$found) throw new Exception('it is not on the site, so it can not be removed');
        if (!wp_trash_post($found[0]->ID)) throw new Exception('WordPress did not move it to the trash');
        return;
      }
      if ($by_id && !$found) throw new Exception('no post without a slug has the ID ' . $id[1] . ', and a post can not be created under a key of this form. A key that is # and a number is how a post without a slug is listed, by its ID. To create a post, write a key without #, which becomes its slug');
      $post = ['post_type' => 'post'] + ($by_id ? [] : ['post_name' => $key]);
      foreach (['title' => 'post_title', 'status' => 'post_status', 'content' => 'post_content'] as $field => $column) {
        if (array_key_exists($field, $fields)) $post[$column] = $fields[$field];
      }
      $saved = $found ? wp_update_post(wp_slash(['ID' => $found[0]->ID] + $post), true) : wp_insert_post(wp_slash($post), true);
      if (is_wp_error($saved)) throw new Exception($saved->get_error_message());`,
  },
};
