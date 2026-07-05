import {
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Freelancer = {
  id: number;
  name: string;
  rate: number;
  job: string;
};


type FreelancerDialogProps = {
  freelancer: Freelancer;
};


export function FreelancerDialog({freelancer,}: FreelancerDialogProps) {
  return (
    <DialogContent>
      <DialogTitle>{freelancer.name}</DialogTitle>
      <p>PHP {freelancer.rate}</p>
      <p>{freelancer.job}</p>
    </DialogContent>
  );
}