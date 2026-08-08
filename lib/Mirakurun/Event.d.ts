import EventEmitter from "eventemitter3";
import * as apid from "../../api";
export declare class Event extends EventEmitter {
    static get log(): apid.Event[];
    static onEvent(listener: (message: apid.Event) => void): void;
    static onceEvent(listener: (message: apid.Event) => void): void;
    static removeListener(listener: (...args: any[]) => void): void;
    static emit(resource: apid.EventResource, type: apid.EventType, data: any): boolean;
    private _log;
    constructor();
    get log(): apid.Event[];
}
export default Event;
