import * as apid from "../../api";
import ChannelItem from "./ChannelItem";
export declare class Channel {
    private _items;
    private _startup;
    constructor();
    get items(): ChannelItem[];
    add(item: ChannelItem): void;
    get(type: apid.ChannelType, channel: string): ChannelItem;
    findByType(type: apid.ChannelType): ChannelItem[];
    private _load;
    private _epgGatherer;
}
export default Channel;
