// Server component — generateStaticParams required for static export.
import PaymentsClient from "./PaymentsClient";

export function generateStaticParams() {
  return [{ id: "stub" }];
}

export default function PaymentsPage() {
  return <PaymentsClient />;
}
