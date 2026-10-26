CREATE INDEX "clients_workspace_created_idx" ON "clients" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_workspace_created_idx" ON "projects" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_client_idx" ON "projects" USING btree ("client_id");