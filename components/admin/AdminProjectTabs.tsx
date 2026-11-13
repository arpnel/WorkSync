"use client";

import AdminRecords from "@/components/admin/AdminRecords";
import AdminProjectPipeline from "@/components/admin/AdminProjectPipeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ADMIN_MODULES } from "@/services/admin/adminModules";

export default function AdminProjectTabs() {
  return (
    <Tabs defaultValue="projects" className="min-w-0">
      <TabsList aria-label="Project administration sections" className="grid w-full grid-cols-2 sm:w-fit">
        <TabsTrigger value="projects">Projects</TabsTrigger>
        <TabsTrigger value="discussion">In discussion &amp; agreement</TabsTrigger>
      </TabsList>
      <TabsContent value="projects" className="mt-4">
        <AdminRecords
          module={ADMIN_MODULES.projects}
          title="Projects and contracts"
          showHeader={false}
        />
      </TabsContent>
      <TabsContent value="discussion" className="mt-4">
        <AdminProjectPipeline />
      </TabsContent>
    </Tabs>
  );
}
