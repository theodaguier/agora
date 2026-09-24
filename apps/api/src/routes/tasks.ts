import { Hono } from "hono";
import { z } from "zod";
import { HermesError } from "../hermes-admin";
import { requireUser, type AppEnv } from "../middleware";
import { createTask, deleteTask, getTask, setCurrentTask, listAgentTasks, listTasks, taskInput, taskPatch, updateTask } from "../tasks";
import { errors } from "../errors.messages";
import { tr } from "../i18n";

/** Tasks: anyone can read anyone's, and assign one to a colleague. */
export const tasks = new Hono<AppEnv>()
  .use(requireUser)
  .onError((err, c) => {
    if (err instanceof HermesError) return c.json({ error: err.message }, err.status as 400);
    console.error("tasks", err);
    return c.json({ error: tr(errors).unexpected }, 500);
  })

  /** `?user=<id>`: tasks they work on or created; yourself by default. `?agent=<id>`: tasks the bot created. */
  .get("/", async (c) => {
    const query = z.object({ user: z.string().min(1).optional(), agent: z.string().min(1).optional() }).safeParse(c.req.query());
    if (!query.success) throw new HermesError(tr(errors).invalidRequest, 400);
    if (query.data.agent) return c.json(await listAgentTasks(c.get("user"), query.data.agent));
    return c.json(await listTasks(c.get("user"), query.data.user));
  })

  /** One task, to show one cited in a message. */
  .get("/:id", async (c) => c.json(await getTask(c.get("user"), c.req.param("id"))))

  .post("/", async (c) => {
    const body = taskInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new HermesError(tr(errors).invalidRequest, 400);
    return c.json(await createTask(body.data, c.get("user")), 201);
  })

  /** What you're working on right now: one of your tasks, or null to clear it. */
  .put("/current", async (c) => {
    const body = z.object({ taskId: z.string().min(1).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new HermesError(tr(errors).invalidRequest, 400);
    await setCurrentTask(body.data.taskId, c.get("user"));
    return c.body(null, 204);
  })

  .patch("/:id", async (c) => {
    const body = taskPatch.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new HermesError(tr(errors).invalidRequest, 400);
    return c.json(await updateTask(c.req.param("id"), body.data, c.get("user")));
  })

  .delete("/:id", async (c) => {
    await deleteTask(c.req.param("id"), c.get("user"));
    return c.body(null, 204);
  });
