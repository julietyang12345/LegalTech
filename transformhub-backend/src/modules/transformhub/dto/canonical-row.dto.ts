import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CanonicalRowDto {
  @IsString()
  id: string;

  @IsString() @IsOptional() date?: string;
  @IsString() @IsOptional() entity_name?: string;
  @IsString() @IsOptional() account_code?: string;
  @IsString() @IsOptional() account_name?: string;
  @IsString() @IsOptional() debit?: string;
  @IsString() @IsOptional() credit?: string;
  @IsString() @IsOptional() currency?: string;
  @IsString() @IsOptional() memo?: string;
  @IsString() @IsOptional() source_platform?: string;
  @IsString() @IsOptional() source_row_ref?: string;
  @IsString() @IsOptional() journal_id?: string;
  @IsNumber() @IsOptional() mapping_confidence?: number;
  @IsString() @IsOptional() review_status?: string;
  @IsBoolean() @IsOptional() needs_review?: boolean;
  @IsString() @IsOptional() suggested_fix?: string | null;
  @IsString() @IsOptional() qbo_account_id?: string | null;
  @IsString() @IsOptional() qbo_txn_id?: string | null;
  @IsString() @IsOptional() canonical_person_id?: string | null;
  @IsString() @IsOptional() canonical_household_id?: string | null;
  @IsString() @IsOptional() raw_fund?: string | null;
  @IsString() @IsOptional() raw_appeal?: string | null;
  @IsString() @IsOptional() taxonomy_exception_id?: string | null;
  @IsString() @IsOptional() canonical_org_id?: string | null;
  @IsString() @IsOptional() attribution_entry_id?: string | null;
  @IsString() @IsOptional() normalized_fund?: string | null;
  @IsString() @IsOptional() normalized_appeal?: string | null;
}
