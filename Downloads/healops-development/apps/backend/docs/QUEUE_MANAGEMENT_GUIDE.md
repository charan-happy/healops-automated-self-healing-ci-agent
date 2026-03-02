# 📖 Queue Management Guide

This document explains how to work with queues in our NestJS + BullMQ setup.
The system is split into **two processes**:

* **API App** → handles HTTP requests, adds jobs to queues, exposes Queue UI (BullBoard).
* **Worker App** → runs processors, executes jobs, handles DLQ (Dead Letter Queue) + cron tasks.

---

## 🗂 Folder Structure Overview

```
src/
  bg/
    background.module.ts        # Worker-only queue setup
    queue-ui.module.ts          # API-only queue dashboard
    queue-add-manager.ts        # Helper to add jobs
  email-queue/
    email-queue.module.ts       # Worker email queue module
    email-queue-ui.module.ts    # API email queue UI module
    email.processor.ts          # Processor logic (Worker)
    email.queue.ts              # Producer wrapper (API)
    email-queue.service.ts      # Job execution service (Worker)
    email-queue.events.ts       # Event listeners
  notification-queue/           # Similar structure
  cron/                         # Cron jobs + UI
  dead-letter-queue/            # DLQ worker module
  services/                     # Shared business services
```

---

## ➕ Adding a New Queue

When you need a brand-new queue (e.g., `report` queue):

1. **Define queue name**
   Add it to `QUEUE_LIST` in `@bg/constants/job.constant.ts`.

2. **Create Worker module**

   ```ts
   @Module({
     imports: [DeadLetterQueueModule], // if needed
     providers: [ReportProcessor, ReportQueueService],
   })
   export class ReportQueueModule {}
   ```

3. **Create API UI module**

   ```ts
   @Module({
     imports: [
       BullBoardModule.forFeature({
         name: QueueName.REPORT,
         adapter: BullMQAdapter,
         options: { displayName: 'Report Queue' },
       }),
     ],
     providers: [ReportQueue, ReportQueueEvents],
     exports: [ReportQueue],
   })
   export class ReportQueueUIModule {}
   ```

4. **Register modules**

   * Add `ReportQueueModule` in **Worker** (`BackgroundModule`).
   * Add `ReportQueueUIModule` in **API** (`QueueUIModule`).

5. **Add processors** (Worker) & **add-job manager methods** (API).

---

## 📝 Adding a Job to an Existing Queue

1. Add a method in `AddingJobsToQueueManager` or inside specific queue wrapper (`email.queue.ts`):

   ```ts
   async addWeeklyReportJob(data: IWeeklyReportJob): Promise<void> {
     return this.addJob(this.reportQueue, JobName.WEEKLY_REPORT, data);
   }
   ```

2. Define the job name in `JobName` enum (`job.constant.ts`).

3. Implement processor logic in the Worker:

   ```ts
   @Processor(QueueName.REPORT)
   export class ReportProcessor extends WorkerHost {
     async process(job: Job<IWeeklyReportJob>) {
       return this.reportService.generateWeekly(job.data);
     }
   }
   ```

---

## 👀 Accessing Queues UI (BullBoard)

* API App exposes BullBoard at:

  ```url
  https://<api-host>/admin/queues
  ```

* UI includes:

  * **Email Queue**
  * **Notification Queue**
  * **Cron jobs**
  * **Dead Letter Queue**

* **Security**:
  `DevToolsMiddleware` is configured at `app.module.ts` layer which can be updated to use auth tokens of the system and add restrictions accordingly.

---

## 🚨 Dead Letter Queue (DLQ)

* **Worker App** pushes failed jobs to DLQ via `DeadLetterQueueService`.
* **API App** shows DLQ in the BullBoard UI (`DeadLetterQueueUIModule`).
* Developers do **not** need to re-register DLQ. It is one-time setup.

**Retrying jobs**:
Jobs can be manually retried via the BullBoard UI. Failed jobs are visible with stack traces and failure reasons.

---

## ⚡ Best Practices

* ✅ **Common services** (like `EmailService`, `NotificationService`) live in `src/services` and are imported in both API and Worker DI graphs.
* ✅ Always define new job names in `JobName` enum.
* ✅ Add event listeners (`*.events.ts`) for monitoring job lifecycle if needed.
* ✅ Use DLQ for resilience — never silently drop failed jobs.
* ✅ Use `AddingJobsToQueueManager` for centralized job enqueueing.
