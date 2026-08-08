import * as apid from "../../api";
import Job from "./Job";
import Event from "./Event";
import Tuner from "./Tuner";
import Channel from "./Channel";
import Service from "./Service";
import Program from "./Program";
import Server from "./Server";
interface Shared {
    readonly config: {
        server?: apid.ConfigServer;
        channels?: apid.ConfigChannels;
        tuners?: apid.ConfigTuners;
    };
    readonly configIntegrity: {
        channels: string;
    };
    job?: Job;
    event?: Event;
    tuner?: Tuner;
    channel?: Channel;
    service?: Service;
    program?: Program;
    server?: Server;
}
export declare const _: Shared;
export default _;
