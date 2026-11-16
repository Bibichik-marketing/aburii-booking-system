import { z } from "zod";
export const bookingSchema = z
  .object({
    id: z.string().uuid(),
    start: z.string().datetime({ offset: true }),
    area: z.enum(["counter", "private"]),
    guests: z.number().int().min(1).max(200),
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    email: z.union([z.string().email().max(254), z.literal("")]),
    requests: z.string().trim().max(1000),
    consent: z.literal(true),
    whatsapp: z.boolean(),
  })
  .strict();
export const areaSchema = z
  .object({
    enabled: z.boolean(),
    capacity: z.number().int().min(0).max(1000),
    min: z.number().int().min(1).max(200),
    max: z.number().int().min(1).max(200),
    duration: z.number().int().min(15).max(480),
    minimumSpend: z.number().min(0).max(100000),
  })
  .refine((x) => x.max >= x.min, "Maximum must exceed minimum");
export const configSchema = z
  .object({
    counter: areaSchema,
    private: areaSchema,
    rooms: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
            name: z.string().min(1).max(80),
            capacity: z.number().int().min(1).max(200),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    noticeMinutes: z.number().int().min(0).max(43200),
    advanceDays: z.number().int().min(1).max(365),
    holdMinutes: z.number().int().min(5).max(1440),
    services: z
      .array(
        z
          .object({
            date: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            day: z.number().int().min(0).max(6).optional(),
            area: z.enum(["counter", "private"]),
            times: z
              .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
              .max(96),
          })
          .refine(
            (x) => (x.date !== undefined) !== (x.day !== undefined),
            "Choose date or weekday",
          ),
      )
      .max(800),
    closures: z
      .array(
        z
          .object({
            start: z.string().datetime({ offset: true }),
            end: z.string().datetime({ offset: true }),
            area: z.enum(["all", "counter", "private"]),
          })
          .refine((x) => x.end > x.start),
      )
      .max(500),
  })
  .strict()
  .refine(
    (x) => new Set(x.rooms.map((r) => r.id)).size === x.rooms.length,
    "Room IDs must be unique",
  );
