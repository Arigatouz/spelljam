import { createFileRoute } from "@tanstack/react-router";
import { SpelljamApp } from "@/components/spelljam/app";

export const Route = createFileRoute("/")({ component: SpelljamApp });
