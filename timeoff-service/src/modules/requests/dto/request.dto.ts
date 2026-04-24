import {
  IsString, IsNotEmpty, IsNumber, IsPositive, IsDateString, IsOptional, Min,
} from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsNumber()
  @IsPositive()
  @Min(0.5)
  daysRequested: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
