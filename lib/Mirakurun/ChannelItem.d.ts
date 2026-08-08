import * as stream from "stream";
import * as common from "./common";
import * as apid from "../../api";
import ServiceItem from "./ServiceItem";
import TSFilter from "./TSFilter";
export default class ChannelItem {
    readonly name: string;
    readonly type: apid.ChannelType;
    readonly channel: string;
    readonly tsmfRelTs: number;
    readonly commandVars: apid.ConfigChannelsItem["commandVars"];
    constructor(config: apid.ConfigChannelsItem);
    getServices(): ServiceItem[];
    getStream(user: common.User, output: stream.Writable): Promise<TSFilter>;
}
