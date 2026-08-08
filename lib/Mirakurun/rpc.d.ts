import * as http from "http";
import RPCServer from "jsonrpc2-ws/lib/server";
export interface JoinParams {
    rooms: string[];
}
export interface NotifyParams<T> {
    array: T[];
}
export declare function createRPCServer(server: http.Server): RPCServer;
export declare function initRPCNotifier(rpcs: Set<RPCServer>): void;
