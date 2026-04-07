import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import pino from "pino";

import { asyncHandler } from "./common/http";
import { errorHandler, notFoundMiddleware } from "./common/middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { aiRouter } from "./modules/ai/core/ai.routes";
import { orgRouter } from "./modules/org/org.routes";
import {
  attachmentsRouter,
  commentsRouter,
  filesRouter,
  relationsRouter,
  subtasksRouter,
  tagsRouter,
  taskRouter,
  workloadRouter,
} from "./modules/task/task.routes";
import { projectRouter } from "./modules/project/project.routes";
import { authMiddleware } from "./common/middleware";

const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: { colorize: true },
        }
      : undefined,
});

export const app = express();

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

app.get("/health", (_req, res) => {
  res.json({ code: 0, message: "ok", data: { status: "healthy" } });
});

app.use("/api", asyncHandler(authMiddleware));
app.use("/api/auth", authRouter);
app.use("/api/org", orgRouter);
app.use("/api/projects", projectRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/subtasks", subtasksRouter);
app.use("/api/comments", commentsRouter);
app.use("/api/files", filesRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/relations", relationsRouter);
app.use("/api/workload", workloadRouter);
app.use("/api/ai", aiRouter);

app.use(notFoundMiddleware);
app.use(errorHandler);
