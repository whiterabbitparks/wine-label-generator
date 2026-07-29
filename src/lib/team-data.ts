export interface TeamMember {
  id: string;
  name: string;
  role: string;
  bio: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: '1',
    name: 'Emma Chen',
    role: 'Design Director',
    bio: 'Visual design & art direction for all label styles',
  },
  {
    id: '2',
    name: 'Alex Rivera',
    role: 'Lead Developer',
    bio: 'Full-stack development & API architecture',
  },
  {
    id: '3',
    name: 'Jordan Lee',
    role: 'Product Manager',
    bio: 'Product strategy & user experience design',
  },
  {
    id: '4',
    name: 'Casey Smith',
    role: 'Operations',
    bio: 'Customer success & business growth',
  },
];
