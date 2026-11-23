// How an installed program signs in. It has its own file because the agents and the judges both use it.

/** `login` uses the subscription the program is signed in with on this machine; `api-key` uses a key from the environment. */
export type SignIn = 'login' | 'api-key';
