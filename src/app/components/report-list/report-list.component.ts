import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { REPORT_LAYOUTS, ReportPrintService } from '../../services/report-print.service';

// Entry point for the report layouts that have no other home in the app yet. Each card
// opens that layout's responsive preview (ReportPreviewComponent) preloaded with sample
// data, which is what makes them reviewable now - the real data sources aren't wired up.
@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-list.component.html',
  styleUrls: ['./report-list.component.css']
})
export class ReportListComponent {
  readonly layouts = REPORT_LAYOUTS;

  constructor(private reportPrintService: ReportPrintService) {}

  openPreview(reportId: string): void {
    this.reportPrintService.openSampleReportPreview(reportId);
  }
}
