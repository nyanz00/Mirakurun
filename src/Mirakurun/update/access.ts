/*
   Copyright 2026 kanreisa

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
import { IPv4, IPv4CidrRange, IPv4Prefix, Validator } from "ip-num";
import _ from "../_";

export function isLoopbackAddress(address: string): boolean {
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export function canManageUpdate(address: string): boolean {
    if (address === "::1") {
        return true;
    }
    const normalized = address && address.startsWith("::ffff:") ? address.slice(7) : address;
    if (!normalized || !Validator.isValidIPv4String(normalized)[0]) {
        return false;
    }
    const client = new IPv4CidrRange(new IPv4(normalized), new IPv4Prefix(32));
    const ranges = _.config.server.updateAllowIPv4CidrRanges || ["127.0.0.1/32"];
    return ranges.some(range => client.inside(IPv4CidrRange.fromCidr(range)));
}
