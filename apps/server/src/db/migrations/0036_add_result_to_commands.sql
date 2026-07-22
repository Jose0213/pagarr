-- Ported from Datastore/Migration/036_add_result_to_commands.cs
ALTER TABLE "Commands" ADD COLUMN "Result" INTEGER NOT NULL DEFAULT 1;
