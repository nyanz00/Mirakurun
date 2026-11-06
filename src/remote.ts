/*
   Copyright 2018 kanreisa

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
import { StreamSession } from "./Mirakurun/remote/StreamSession";

process.title = "Mirakurun: Remote";
const priorityArg = process.argv.find(arg => arg.startsWith("priority="));
const session = new StreamSession({
    host: process.argv[2], port: parseInt(process.argv[3], 10),
    type: process.argv[4], channel: process.argv[5],
    decode: process.argv.includes("decode"),
    priority: priorityArg ? parseInt(priorityArg.slice(9), 10) : 0
}, process.stdout, event => {
    if (process.connected) {
        process.send({ remote: event }, () => undefined);
    }
    if (event.state !== "idle") {
        console.error("remote:", event.id, event.state, event.error || "");
    }
});

process.stdin.resume();
process.stdin.on("data", () => exit());
process.on("SIGTERM", () => exit());
process.on("disconnect", () => exit());
process.on("message", (message: any) => {
    if (message && message.type === "priority") {
        session.setPriority(message.priority);
    }
});
session.start();

function exit() {
    session.stop();
    process.exit(0);
}
