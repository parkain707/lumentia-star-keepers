import {makeHandler} from './gateway.js';
Deno.serve(makeHandler({env:Deno.env}));
