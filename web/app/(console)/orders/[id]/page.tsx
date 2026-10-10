"use client";

import { useParams } from "next/navigation";
import { OrderReview } from "@/components/order/OrderReview";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  // key: a fresh review state (selection, drawer, call map) per order.
  return <OrderReview key={id} id={decodeURIComponent(id)} />;
}
