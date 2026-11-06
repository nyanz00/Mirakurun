/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import { Operation } from "express-openapi";
import * as api from "../../api";
import manager from "../../remote/RemoteManager";

export const post: Operation = (req, res) => {
    if (!manager.updatePriority(req.body.id, req.ip, req.body.priority)) {
        return api.responseError(res, 409);
    }
    return api.responseJSON(res, { updated: true });
};
post.apiDoc = {
    tags: ["remote"], operationId: "updateRemotePriority",
    parameters: [{ in: "body", name: "body", required: true, schema: {
        type: "object", required: ["id", "priority"], properties: {
            id: { type: "string", maxLength: 36 }, priority: { type: "integer", minimum: 0 }
        }
    } }],
    responses: { 200: { description: "Priority updated" }, 409: { description: "Stream not owned by caller or already closed" } }
};
