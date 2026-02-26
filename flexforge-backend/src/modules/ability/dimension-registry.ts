import { SkillType } from '../curriculum/services/skill-detector.service';

export interface DimensionDef {
  id: string;
  label: string;
  description: string;
}

export const DIMENSION_REGISTRY: Record<SkillType, DimensionDef[]> = {
  [SkillType.CODE]: [
    {
      id: 'correctness',
      label: 'Correctness',
      description:
        'Does the solution produce correct output? Would it run without errors?',
    },
    {
      id: 'structure',
      label: 'Code Structure',
      description:
        'Is the code organized, readable, with clear naming and separation of concerns?',
    },
    {
      id: 'edgeCases',
      label: 'Edge Case Handling',
      description:
        'Does the solution handle boundary conditions, empty inputs, and unexpected states?',
    },
    {
      id: 'problemSolving',
      label: 'Problem Solving',
      description:
        'Was the approach logical? Did they break the problem down effectively?',
    },
    {
      id: 'tooling',
      label: 'Tooling & Ecosystem',
      description:
        'Appropriate use of frameworks, libraries, APIs, and language features?',
    },
    {
      id: 'communication',
      label: 'Communication',
      description:
        'Are decisions documented? Is the code self-explanatory? Good commit messages, comments where needed?',
    },
  ],

  [SkillType.KNOWLEDGE]: [
    {
      id: 'conceptualDepth',
      label: 'Conceptual Depth',
      description:
        'Does the response show understanding beyond surface-level definitions? Can they explain why, not just what?',
    },
    {
      id: 'practicalApplication',
      label: 'Practical Application',
      description:
        'Can they apply concepts to real scenarios? Do they connect theory to practice?',
    },
    {
      id: 'structuralCompleteness',
      label: 'Structural Completeness',
      description:
        'Does the answer cover the full scope? Are key components addressed without major gaps?',
    },
    {
      id: 'constraintAwareness',
      label: 'Constraint Awareness',
      description:
        'Do they recognize limitations, trade-offs, and boundary conditions of the topic?',
    },
    {
      id: 'problemSolving',
      label: 'Problem Solving',
      description:
        'Was the approach logical? Did they break the problem down effectively?',
    },
    {
      id: 'communication',
      label: 'Communication',
      description:
        'Is the explanation clear, well-structured, and appropriate for the audience?',
    },
  ],

  [SkillType.AI_AGENT]: [
    {
      id: 'pipelineDesign',
      label: 'Pipeline Design',
      description:
        'Is the AI pipeline well-structured? Are components connected logically with clear data flow?',
    },
    {
      id: 'evaluationStrategy',
      label: 'Evaluation Strategy',
      description:
        'Is there a clear plan for measuring quality? Are metrics appropriate and measurable?',
    },
    {
      id: 'guardrails',
      label: 'Guardrails & Safety',
      description:
        'Are there safeguards against hallucination, misuse, and edge cases? Is output validated?',
    },
    {
      id: 'operationalThinking',
      label: 'Operational Thinking',
      description:
        'Are cost, latency, monitoring, and failure modes considered? Is the solution production-ready?',
    },
    {
      id: 'tooling',
      label: 'Tooling & Ecosystem',
      description:
        'Appropriate use of models, frameworks, APIs, and AI-specific tools?',
    },
    {
      id: 'communication',
      label: 'Communication',
      description:
        'Are design decisions documented? Is the reasoning behind choices clear?',
    },
  ],

  [SkillType.DESIGN]: [
    {
      id: 'userEmpathy',
      label: 'User Empathy',
      description:
        'Does the design consider the user perspective? Are pain points and needs addressed?',
    },
    {
      id: 'visualHierarchy',
      label: 'Visual Hierarchy',
      description:
        'Is the visual layout clear? Do important elements stand out? Is the flow intuitive?',
    },
    {
      id: 'systemThinking',
      label: 'System Thinking',
      description:
        'Does the design account for edge states, error cases, and the full user journey?',
    },
    {
      id: 'constraintAwareness',
      label: 'Constraint Awareness',
      description:
        'Are technical, business, and accessibility constraints considered in the design?',
    },
    {
      id: 'problemSolving',
      label: 'Problem Solving',
      description:
        'Was the design approach logical? Did they explore alternatives before deciding?',
    },
    {
      id: 'communication',
      label: 'Communication',
      description:
        'Are design decisions justified? Is the rationale clear and well-presented?',
    },
  ],

  [SkillType.PHYSICAL]: [
    {
      id: 'conceptualDepth',
      label: 'Conceptual Depth',
      description:
        'Does the response show understanding beyond surface-level definitions? Can they explain why, not just what?',
    },
    {
      id: 'practicalApplication',
      label: 'Practical Application',
      description:
        'Can they apply concepts to real scenarios? Do they connect theory to practice?',
    },
    {
      id: 'structuralCompleteness',
      label: 'Structural Completeness',
      description:
        'Does the answer cover the full scope? Are key components addressed without major gaps?',
    },
    {
      id: 'constraintAwareness',
      label: 'Constraint Awareness',
      description:
        'Do they recognize limitations, trade-offs, and boundary conditions of the topic?',
    },
    {
      id: 'problemSolving',
      label: 'Problem Solving',
      description:
        'Was the approach logical? Did they break the problem down effectively?',
    },
    {
      id: 'communication',
      label: 'Communication',
      description:
        'Is the explanation clear, well-structured, and appropriate for the audience?',
    },
  ],
};

/**
 * Get dimensions for a skill type, falling back to KNOWLEDGE dimensions
 */
export function getDimensions(skillType: SkillType): DimensionDef[] {
  return DIMENSION_REGISTRY[skillType] || DIMENSION_REGISTRY[SkillType.KNOWLEDGE];
}
