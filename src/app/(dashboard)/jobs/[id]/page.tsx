// Server component — generateStaticParams required for static export.
// Actual rendering happens in JobDetailClient which reads the UUID from window.location.pathname.
import JobDetailClient from "./JobDetailClient";

export function generateStaticParams() {
  return [{ id: "stub" }];
}

export default function JobDetailPage() {
  return <JobDetailClient />;
}
