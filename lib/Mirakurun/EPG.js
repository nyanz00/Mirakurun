"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Program_1 = require("./Program");
const common_1 = require("./common");
const _1 = __importDefault(require("./_"));
const aribts_1 = require("@chinachu/aribts");
const STREAM_CONTENT = {
    1: "mpeg2",
    5: "h.264",
    9: "h.265"
};
const COMPONENT_TYPE = {
    0x01: "480i",
    0x02: "480i",
    0x03: "480i",
    0x04: "480i",
    0x83: "4320p",
    0x91: "2160p",
    0x92: "2160p",
    0x93: "2160p",
    0x94: "2160p",
    0xA1: "480p",
    0xA2: "480p",
    0xA3: "480p",
    0xA4: "480p",
    0xB1: "1080i",
    0xB2: "1080i",
    0xB3: "1080i",
    0xB4: "1080i",
    0xC1: "720p",
    0xC2: "720p",
    0xC3: "720p",
    0xC4: "720p",
    0xD1: "240p",
    0xD2: "240p",
    0xD3: "240p",
    0xD4: "240p",
    0xE1: "1080p",
    0xE2: "1080p",
    0xE3: "1080p",
    0xE4: "1080p",
    0xF1: "180p",
    0xF2: "180p",
    0xF3: "180p",
    0xF4: "180p"
};
const SAMPLING_RATE = {
    0: -1,
    1: 16000,
    2: 22050,
    3: 24000,
    4: -1,
    5: 32000,
    6: 44100,
    7: 48000
};
const UNKNOWN_START_TIME = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
const UNKNOWN_DURATION = Buffer.from([0xFF, 0xFF, 0xFF]);
const ISO_639_LANG_CODE = {
    jpn: Buffer.from("6A706E", "hex"),
    eng: Buffer.from("656E67", "hex"),
    deu: Buffer.from("646575", "hex"),
    fra: Buffer.from("667261", "hex"),
    ita: Buffer.from("697461", "hex"),
    rus: Buffer.from("727573", "hex"),
    zho: Buffer.from("7A686F", "hex"),
    kor: Buffer.from("6B6F72", "hex"),
    spa: Buffer.from("737061", "hex"),
    etc: Buffer.from("657463", "hex")
};
class EPG {
    _epg = {};
    write(eit) {
        if (!this._epg) {
            return;
        }
        const isPF = (eit.table_id === 0x4E || eit.table_id === 0x4F);
        if (isPF && eit.section_number > 1) {
            return;
        }
        const isP = isPF && eit.section_number === 0;
        const isF = isPF && eit.section_number === 1;
        const networkId = eit.original_network_id;
        if (!this._epg[networkId]) {
            this._epg[networkId] = {};
        }
        if (!this._epg[networkId][eit.service_id]) {
            this._epg[networkId][eit.service_id] = {};
        }
        const service = this._epg[networkId][eit.service_id];
        for (const e of eit.events) {
            let state;
            if (!service[e.event_id]) {
                const id = (0, Program_1.getProgramItemId)(networkId, eit.service_id, e.event_id);
                if (!_1.default.program.exists(id)) {
                    if (UNKNOWN_START_TIME.compare(e.start_time) === 0) {
                        continue;
                    }
                    const programItem = {
                        id,
                        eventId: e.event_id,
                        serviceId: eit.service_id,
                        networkId: networkId,
                        startAt: (0, common_1.getTimeFromMJD)(e.start_time),
                        duration: UNKNOWN_DURATION.compare(e.duration) === 0 ? 1 : (0, common_1.getTimeFromBCD24)(e.duration),
                        isFree: e.free_CA_mode === 0,
                        _pf: isPF || undefined,
                        _isPresent: isP || undefined,
                        _isFollowing: isF || undefined
                    };
                    _1.default.program.add(programItem);
                }
                state = {
                    version: {},
                    programId: id,
                    short: {
                        version: {}
                    },
                    extended: {
                        version: {}
                    },
                    component: {
                        version: {}
                    },
                    content: {
                        version: {}
                    },
                    audio: {
                        version: {},
                        _audios: {}
                    },
                    series: {
                        version: {}
                    },
                    group: {
                        version: {},
                        _groups: []
                    },
                    present: isP || undefined,
                    following: isF || undefined
                };
                state.version[eit.table_id] = eit.version_number;
                service[e.event_id] = state;
            }
            else {
                state = service[e.event_id];
                if ((!state.present && isP) || (!state.following && isF) || isOutOfDate(eit, state.version)) {
                    state.version[eit.table_id] = eit.version_number;
                    if (UNKNOWN_START_TIME.compare(e.start_time) !== 0) {
                        _1.default.program.set(state.programId, {
                            startAt: (0, common_1.getTimeFromMJD)(e.start_time),
                            duration: UNKNOWN_DURATION.compare(e.duration) === 0 ? 1 : (0, common_1.getTimeFromBCD24)(e.duration),
                            isFree: e.free_CA_mode === 0,
                            _pf: isPF || undefined,
                            _isPresent: isP || undefined,
                            _isFollowing: isF || undefined
                        });
                    }
                    state.present = isP || undefined;
                    state.following = isF || undefined;
                }
            }
            for (const d of e.descriptors) {
                switch (d.descriptor_tag) {
                    case 0x4D:
                        if (!isOutOfDate(eit, state.short.version)) {
                            break;
                        }
                        state.short.version[eit.table_id] = eit.version_number;
                        _1.default.program.set(state.programId, {
                            name: new aribts_1.TsChar(d.event_name_char).decode(),
                            description: new aribts_1.TsChar(d.text_char).decode()
                        });
                        break;
                    case 0x4E:
                        if (isOutOfDate(eit, state.extended.version)) {
                            state.extended.version[eit.table_id] = eit.version_number;
                            state.extended._descs = new Array(d.last_descriptor_number + 1);
                            state.extended._done = false;
                        }
                        else if (state.extended._done) {
                            break;
                        }
                        if (!state.extended._descs[d.descriptor_number]) {
                            state.extended._descs[d.descriptor_number] = d.items;
                            let comp = true;
                            for (const descs of state.extended._descs) {
                                if (typeof descs === "undefined") {
                                    comp = false;
                                    break;
                                }
                            }
                            if (comp === false) {
                                break;
                            }
                            const extendedBuffers = {};
                            let current = "";
                            for (const descs of state.extended._descs) {
                                for (const desc of descs) {
                                    const isContinuation = desc.item_description_length === 0;
                                    const key = isContinuation
                                        ? current
                                        : new aribts_1.TsChar(desc.item_description_char).decode();
                                    current = key;
                                    if (!extendedBuffers[key]) {
                                        extendedBuffers[key] = [];
                                    }
                                    if (isContinuation && extendedBuffers[key].length > 0) {
                                        const last = extendedBuffers[key].length - 1;
                                        extendedBuffers[key][last] = Buffer.concat([
                                            extendedBuffers[key][last],
                                            desc.item_char
                                        ]);
                                    }
                                    else {
                                        extendedBuffers[key].push(desc.item_char);
                                    }
                                }
                            }
                            const extended = {};
                            for (const key of Object.keys(extendedBuffers)) {
                                extended[key] = extendedBuffers[key]
                                    .map(buf => new aribts_1.TsChar(buf).decode())
                                    .join("\n\n");
                            }
                            _1.default.program.set(state.programId, {
                                extended: extended
                            });
                            delete state.extended._descs;
                            state.extended._done = true;
                        }
                        break;
                    case 0x50:
                        if (!isOutOfDate(eit, state.component.version)) {
                            break;
                        }
                        state.component.version[eit.table_id] = eit.version_number;
                        _1.default.program.set(state.programId, {
                            video: {
                                type: STREAM_CONTENT[d.stream_content] || null,
                                resolution: COMPONENT_TYPE[d.component_type] || null,
                                streamContent: d.stream_content,
                                componentType: d.component_type
                            }
                        });
                        break;
                    case 0x54:
                        if (!isOutOfDate(eit, state.content.version)) {
                            break;
                        }
                        state.content.version[eit.table_id] = eit.version_number;
                        _1.default.program.set(state.programId, {
                            genres: d.contents.map(getGenre)
                        });
                        break;
                    case 0xC4:
                        if (!isOutOfDateLv2(eit, state.audio.version, d.component_tag)) {
                            break;
                        }
                        state.audio.version[eit.table_id][d.component_tag] = eit.version_number;
                        const langs = [getLangCode(d.ISO_639_language_code)];
                        if (d.ISO_639_language_code_2) {
                            langs.push(getLangCode(d.ISO_639_language_code_2));
                        }
                        state.audio._audios[d.component_tag] = {
                            componentType: d.component_type,
                            componentTag: d.component_tag,
                            isMain: d.main_component_flag === 1,
                            samplingRate: SAMPLING_RATE[d.sampling_rate],
                            langs
                        };
                        _1.default.program.set(state.programId, {
                            audios: Object.values(state.audio._audios)
                        });
                        break;
                    case 0xD5:
                        if (!isOutOfDate(eit, state.series.version)) {
                            break;
                        }
                        state.series.version[eit.table_id] = eit.version_number;
                        _1.default.program.set(state.programId, {
                            series: {
                                id: d.series_id,
                                repeat: d.repeat_label,
                                pattern: d.program_pattern,
                                expiresAt: d.expire_date_valid_flag === 1 ?
                                    (0, common_1.getTimeFromMJD)(Buffer.from(d.expire_date.toString(16), "hex")) :
                                    -1,
                                episode: d.episode_number,
                                lastEpisode: d.last_episode_number,
                                name: new aribts_1.TsChar(d.series_name_char).decode()
                            }
                        });
                        break;
                    case 0xD6:
                        if (!isOutOfDateLv2(eit, state.group.version, d.group_type)) {
                            break;
                        }
                        state.group.version[eit.table_id][d.group_type] = eit.version_number;
                        state.group._groups[d.group_type] = d.group_type < 4 ?
                            d.events.map(getRelatedProgramItem.bind(d)) :
                            d.other_network_events.map(getRelatedProgramItem.bind(d));
                        _1.default.program.set(state.programId, {
                            relatedItems: state.group._groups.flat()
                        });
                        break;
                }
            }
        }
    }
    end() {
        if (this._epg) {
            delete this._epg;
        }
    }
}
exports.default = EPG;
function isOutOfDate(eit, versionRecord) {
    if ((versionRecord[0x4E] !== undefined && eit.table_id !== 0x4E) ||
        (versionRecord[0x4F] !== undefined && eit.table_id !== 0x4E && eit.table_id !== 0x4F)) {
        return false;
    }
    return versionRecord[eit.table_id] !== eit.version_number;
}
function isOutOfDateLv2(eit, versionRecord, lv2) {
    if ((versionRecord[0x4E] !== undefined && eit.table_id !== 0x4E) ||
        (versionRecord[0x4F] !== undefined && eit.table_id !== 0x4E && eit.table_id !== 0x4F)) {
        return false;
    }
    if (versionRecord[eit.table_id] === undefined) {
        versionRecord[eit.table_id] = {};
    }
    return versionRecord[eit.table_id][lv2] !== eit.version_number;
}
function getGenre(content) {
    return {
        lv1: content.content_nibble_level_1,
        lv2: content.content_nibble_level_2,
        un1: content.user_nibble_1,
        un2: content.user_nibble_2
    };
}
function getLangCode(buffer) {
    for (const code in ISO_639_LANG_CODE) {
        if (ISO_639_LANG_CODE[code].compare(buffer) === 0) {
            return code;
        }
    }
    return "etc";
}
function getRelatedProgramItem(event) {
    return {
        type: (this.group_type === 1 ? "shared" :
            (this.group_type === 2 || this.group_type === 4) ? "relay" : "movement"),
        networkId: event.original_network_id,
        serviceId: event.service_id,
        eventId: event.event_id
    };
}
//# sourceMappingURL=EPG.js.map