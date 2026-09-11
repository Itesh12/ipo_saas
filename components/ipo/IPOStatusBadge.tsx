import React from "react";
import { Badge } from "@/components/ui/Badge";
import { IPOStatus, IPOPublicationStatus } from "@/features/ipo/types/ipo.types";
import { Flame, Clock, CheckCircle, AlertCircle, FileText, CheckCheck, Eye } from "lucide-react";

interface IPOStatusBadgeProps {
  status?: IPOStatus;
  publicationStatus?: IPOPublicationStatus;
  size?: "sm" | "md";
  className?: string;
}

export function IPOStatusBadge({
  status,
  publicationStatus,
  size = "sm",
  className,
}: IPOStatusBadgeProps) {
  // If rendering publication status
  if (publicationStatus) {
    switch (publicationStatus) {
      case "published":
        return (
          <Badge variant="success" size={size} className={className}>
            <Eye className="w-3 h-3 mr-1" /> Published
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="info" size={size} className={className}>
            <CheckCheck className="w-3 h-3 mr-1" /> Approved
          </Badge>
        );
      case "in_review":
        return (
          <Badge variant="warning" size={size} className={className}>
            <Clock className="w-3 h-3 mr-1" /> In Review
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="secondary" size={size} className={className}>
            Archived
          </Badge>
        );
      case "draft":
      default:
        return (
          <Badge variant="outline" size={size} className={className}>
            <FileText className="w-3 h-3 mr-1" /> Draft
          </Badge>
        );
    }
  }

  // If rendering business lifecycle status
  switch (status) {
    case "open":
      return (
        <Badge variant="danger" size={size} className={className}>
          <Flame className="w-3 h-3 mr-1 animate-pulse text-white" /> Bidding Open
        </Badge>
      );
    case "upcoming":
      return (
        <Badge variant="info" size={size} className={className}>
          <Clock className="w-3 h-3 mr-1" /> Upcoming
        </Badge>
      );
    case "closed":
      return (
        <Badge variant="secondary" size={size} className={className}>
          Closed
        </Badge>
      );
    case "allotment_pending":
      return (
        <Badge variant="warning" size={size} className={className}>
          Allotment Pending
        </Badge>
      );
    case "listing_soon":
      return (
        <Badge variant="warning" size={size} className={className}>
          Listing Soon
        </Badge>
      );
    case "listed":
      return (
        <Badge variant="success" size={size} className={className}>
          <CheckCircle className="w-3 h-3 mr-1" /> Listed
        </Badge>
      );
    case "withdrawn":
    case "cancelled":
      return (
        <Badge variant="secondary" size={size} className={className}>
          <AlertCircle className="w-3 h-3 mr-1" /> {status}
        </Badge>
      );
    case "announced":
    default:
      return (
        <Badge variant="outline" size={size} className={className}>
          Announced
        </Badge>
      );
  }
}
