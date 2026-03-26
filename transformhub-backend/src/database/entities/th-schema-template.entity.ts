import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('th_schema_templates')
export class ThSchemaTemplate {
  @PrimaryColumn()
  fingerprint: string;

  @Column()
  platform: string;

  @Column()
  reportType: string;

  @Column({ type: 'jsonb', default: {} })
  fieldMap: Record<string, string>;

  @Column({ type: 'jsonb', default: [] })
  unresolvedFields: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
