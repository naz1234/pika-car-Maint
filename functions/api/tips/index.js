import {json} from '../../lib/http.js';
import {readTips} from '../../lib/tips.js';

export async function onRequestGet({env}){
 return json({tips:await readTips(env)});
}
