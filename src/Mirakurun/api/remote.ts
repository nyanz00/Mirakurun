/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import { Operation } from "express-openapi";
import * as api from "../api";
import manager from "../remote/RemoteManager";
import { canManageUpdate } from "../update/access";

export const get: Operation = (req, res) => api.responseJSON(res, { ...manager.status(), canManage: canManageUpdate(req.ip) });
get.apiDoc = {
    tags: ["remote"], operationId: "getRemoteStatus",
    responses: { 200: { description: "Remote connection status", schema: { $ref: "#/definitions/RemoteStatus" } } }
};
