import {handleOrders} from './orders-api.mjs';
export default {fetch(request,env){return handleOrders(request,env.DB);}};
