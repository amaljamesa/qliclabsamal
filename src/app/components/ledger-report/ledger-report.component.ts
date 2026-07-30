import { AfterViewInit, Component, ElementRef, ViewChild, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { LedgerData, LedgerDetailItem } from '../../models/ledger.model';
import { indianFormat } from '../../services/indian-number-format.util';

const PAGE_HEIGHT_PX = 1100;
const MIDDLE_GAP_PX = 5;
const FOOTER_BUFFER_PX = 10;

@Component({
  selector: 'app-ledger-report',
  standalone: true,
  templateUrl: './ledger-report.component.html',
  styleUrls: ['./ledger-report.component.css'],
  // Pages/rows are built via document.createElement (not Angular templates) so the
  // pagination algorithm can measure real rendered heights before deciding page breaks.
  // Scoped/emulated encapsulation only tags elements compiled from the template, so it
  // wouldn't apply to these dynamically-created nodes - styles need to be global instead.
  encapsulation: ViewEncapsulation.None
})
export class LedgerReportComponent implements AfterViewInit {
  @ViewChild('pagesContainer', { static: true }) pagesContainer!: ElementRef<HTMLDivElement>;

  errorMessage = '';

  private jsonData!: LedgerData;
  private pageCount = 1;

  constructor(private route: ActivatedRoute) {}

  ngAfterViewInit(): void {
    void this.generateReport();
  }

  private base64ToUtf8(base64: string): string {
    const binaryString = atob(base64);
    const bytes = new Uint8Array([...binaryString].map((char) => char.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  // Renders a throwaway footer off in the body purely to measure its real height, since
  // it's the same content/font on every page regardless of page number - one measurement
  // covers the whole document. Previously this budget was a hardcoded 80px guess, which
  // reserved far more room than the footer (a single line of date/time + page number)
  // actually needs, leaving a large unused gap before the footer instead of letting data
  // fill the page.
  private measureFooterHeight(pageNumber: number): number {
    const probe = document.createElement('div');
    this.generateFooterSection(probe, pageNumber);
    document.body.appendChild(probe);
    // generateFooterSection's own element is absolutely positioned, so it doesn't
    // contribute to a non-positioned wrapper's height - measure it directly instead.
    const height = (probe.firstElementChild as HTMLElement).getBoundingClientRect().height;
    document.body.removeChild(probe);
    return height;
  }

  // Polls with rAF until the header section has actually laid out, since its rendered
  // height (used to size the body section below it) isn't available the instant it's appended.
  private waitForHeaderHeight(page: HTMLDivElement): Promise<number> {
    return new Promise((resolve) => {
      const check = () => {
        const headerSection = page.querySelector('.FloatNum');
        // getBoundingClientRect() returns sub-pixel float values that reflect true CSS
        // layout geometry - unlike offsetHeight, which rounds to whole device pixels and
        // can round differently at different browser zoom levels, throwing off pagination.
        const height = headerSection ? headerSection.getBoundingClientRect().height : 0;
        if (height > 0) {
          resolve(height);
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  }

  private async generateReport(): Promise<void> {
    const message = this.route.snapshot.queryParamMap.get('message');
    if (!message) {
      this.errorMessage = 'No message found in the URL parameters.';
      console.error(this.errorMessage);
      return;
    }

    try {
      const storedValue = localStorage.getItem('ledgerData');
      this.jsonData = JSON.parse(this.base64ToUtf8(storedValue ?? message));

      const page = this.createNewPage();
      const localPageNumber = this.pageCount;

      this.addSectionToPage(page, (el) => this.generateHeaderSection(el, this.jsonData));
      const headerAddHeight = await this.waitForHeaderHeight(page);

      const footerSectionHeight = this.measureFooterHeight(localPageNumber) + FOOTER_BUFFER_PX;
      const usedHeight = headerAddHeight + footerSectionHeight;
      const maxHeight = PAGE_HEIGHT_PX - usedHeight;

      this.generateBodySectionWithPagination(page, this.jsonData, this.jsonData.ledger_details, maxHeight);
      this.addSectionToPage(page, (el) => this.generateFooterSection(el, localPageNumber));
    } catch (error) {
      this.errorMessage = 'Error decoding or parsing JSON.';
      console.error('Error decoding or parsing JSON:', error);
    }
  }

  private createNewPage(): HTMLDivElement {
    const newPage = document.createElement('div');
    newPage.className = 'page';
    newPage.style.position = 'relative';
    newPage.style.pageBreakBefore = 'always';
    newPage.style.width = '21cm';
    newPage.style.height = '1100px';

    this.pagesContainer.nativeElement.appendChild(newPage);
    return newPage;
  }

  private addSectionToPage(page: HTMLDivElement, sectionFn: (el: HTMLDivElement) => void): number {
    const tempSection = document.createElement('div');
    sectionFn(tempSection);
    page.appendChild(tempSection);
    return tempSection.getBoundingClientRect().height;
  }

  private generateBodySectionWithPagination(
    initialPage: HTMLDivElement,
    jsonData: LedgerData,
    items: LedgerDetailItem[],
    maxHeight: number
  ): void {
    let currentPage = initialPage;
    let tbody!: HTMLTableSectionElement;
    let currentHeight = 0;
    let adjustedMaxHeight = 0;

    const setupBodySection = (): void => {
      const bodySection = document.createElement('div');
      bodySection.className = 'body';
      bodySection.style.border = jsonData.config.main_table_border === false ? 'hidden' : '1px solid black';
      bodySection.style.margin = '0 20px';
      bodySection.style.maxHeight = `${maxHeight}px`;

      const bodyTable = document.createElement('table');
      bodyTable.className = 'body-table';
      bodyTable.style.border = 'hidden';
      bodyTable.style.width = '100%';
      bodyTable.style.borderCollapse = 'collapse';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const headers: { name: string; width: string; show?: boolean }[] = [
        { name: 'Date', width: '13%' },
        { name: 'Journal ID', width: '5%', show: jsonData.config.show_journal_id },
        { name: 'By/To', width: '3%' },
        { name: 'Type', width: '5%' },
        { name: 'Account Name', width: '45%' },
        { name: 'Debit', width: '10%' },
        { name: 'Credit', width: '10%' },
        { name: 'Balance', width: '15%' }
      ];

      headers.forEach((header) => {
        if (header.show === undefined || header.show) {
          const th = document.createElement('th');
          th.innerHTML = header.name;
          if (jsonData.config.main_table_border === false) {
            th.style.borderTop = 'hidden';
            th.style.borderLeft = 'hidden';
            th.style.borderRight = 'hidden';
            th.style.borderBottom = '1px solid black';
          } else {
            th.style.border = '1px solid black';
          }
          th.style.textAlign = 'center';
          th.style.width = header.width;
          headerRow.appendChild(th);
        }
      });

      thead.appendChild(headerRow);
      bodyTable.appendChild(thead);

      tbody = document.createElement('tbody');
      bodyTable.appendChild(tbody);
      bodySection.appendChild(bodyTable);
      currentPage.appendChild(bodySection);

      const headerHeight = thead.getBoundingClientRect().height;
      adjustedMaxHeight = maxHeight - headerHeight - MIDDLE_GAP_PX;
    };

    const createNewPageWithHeaderFooter = (): void => {
      currentPage = this.createNewPage();
      this.pageCount++;
      this.addSectionToPage(currentPage, (el) => this.generateHeaderSection(el, jsonData));
      this.addSectionToPage(currentPage, (el) => this.generateFooterSection(el, this.pageCount));
      setupBodySection();
    };

    const generateByToAccountNameContent = (item: LedgerDetailItem): string | undefined => {
      const accountNames = item.det_ac_name ? item.det_ac_name.split('\n') : [];
      const amounts = item.det_amount ? item.det_amount.split('\n') : [];
      let rowContent: string | undefined;

      if (item.view_order == 1) {
        rowContent = item.by_to_account_name + '<br>';
        for (let j = 0; j < accountNames.length; j++) {
          rowContent += `
            <div style="display: flex; justify-content: space-between; margin-left: 20px;">
              <span>${accountNames[j] || '-'}</span>
              <span>${amounts[j] || '-'}</span>
            </div>`;
        }
        if (item.narration) {
          rowContent += `<div style="font-style: italic; font-size: 12px;">${item.narration}</div>`;
        }
      } else if (item.view_order == 0) {
        rowContent =
          item.by_to_account_name +
          `<div style="font-style: italic; font-size: 12px;">${item.narration}</div>`;
      }

      return rowContent;
    };

    const addRow = (item: LedgerDetailItem): void => {
      const tableRow = document.createElement('tr');

      const columns: { value: string | undefined | null; textAlign: string }[] = [
        { value: item.journal_date, textAlign: 'center' },
        { value: jsonData.config.show_journal_id ? item.journal_unique_id : null, textAlign: 'center' },
        { value: item.by_to, textAlign: 'center' },
        { value: item.voucher_type, textAlign: 'left' },
        { value: generateByToAccountNameContent(item), textAlign: 'left' },
        { value: indianFormat(item.dr_amount), textAlign: 'right' },
        { value: indianFormat(item.cr_amount), textAlign: 'right' },
        { value: indianFormat(item.balance), textAlign: 'right' }
      ];

      let maxRowHeight = 0;

      columns.forEach((column) => {
        if (column.value !== null && column.value !== undefined) {
          const td = document.createElement('td');
          td.innerHTML = column.value;
          td.style.textAlign = column.textAlign;
          td.style.width = 'auto';
          td.style.border = jsonData.config.main_table_border === false ? 'hidden' : '1px solid black';
          td.style.verticalAlign = 'top';
          tableRow.appendChild(td);

          tbody.appendChild(tableRow);
          const cellHeight = td.getBoundingClientRect().height;
          if (cellHeight > maxRowHeight) {
            maxRowHeight = cellHeight;
          }
          tbody.removeChild(tableRow);
        }
      });

      tbody.appendChild(tableRow);
      currentHeight += maxRowHeight;

      if (currentHeight > adjustedMaxHeight) {
        tbody.removeChild(tableRow);
        createNewPageWithHeaderFooter();
        tbody.appendChild(tableRow);
        currentHeight = maxRowHeight;
      }
    };

    setupBodySection();
    items.forEach((item) => addRow(item));
  }

  private generateHeaderSection(page: HTMLDivElement, data: LedgerData): void {
    const dfloatnum = document.createElement('div');
    dfloatnum.id = 'Float_num';
    dfloatnum.className = 'FloatNum';
    dfloatnum.style.top = '0px';

    const dfloatleft = document.createElement('div');
    dfloatleft.className = 'FloatLeft';

    const floatLefth5 = document.createElement('h5');
    floatLefth5.style.top = '0px';

    const { be_name, be_addline1, be_addline2, be_state, be_pin, be_phone, be_gstin } = data.company_details;
    const nameBlock = `<b><div class="beName">${be_name}</div></b><br>${be_addline1} ${be_addline2} ${be_state} ${be_pin}`;

    if (be_phone !== '' && be_gstin === '') {
      floatLefth5.innerHTML = `${nameBlock}<br>Phone Number: ${be_phone}`;
    } else if (be_phone === '' && be_gstin !== '') {
      floatLefth5.innerHTML = `${nameBlock}<br><b>GSTIN: ${be_gstin}</b>`;
    } else if (be_phone !== '' && be_gstin !== '') {
      floatLefth5.innerHTML = `${nameBlock}<br>Phone Number: ${be_phone}<br><b>GSTIN: ${be_gstin}</b>`;
    } else {
      floatLefth5.innerHTML = nameBlock;
    }
    dfloatleft.appendChild(floatLefth5);

    const dfloatright = document.createElement('div');
    dfloatright.className = 'FloatRight';

    const floatrightp = document.createElement('p');
    floatrightp.className = 'floatrightp';
    floatrightp.innerHTML = `Account Ledger<br>From: ${data.other.from_date} to ${data.other.to_date}`;
    floatrightp.style.marginTop = '-60px';
    floatrightp.style.textAlign = 'right';
    dfloatright.appendChild(floatrightp);

    const hrline = document.createElement('hr');
    hrline.style.marginTop = '18px';
    hrline.style.border = '1px solid';
    hrline.style.width = '95%';

    const headingName = document.createElement('div');
    headingName.className = 'Hname';

    const hName = document.createElement('h4');
    hName.style.textAlign = 'center';
    hName.style.fontSize = '17px';
    hName.style.fontWeight = 'bold';
    hName.innerHTML = `Account: ${data.accounts.account_name}`;
    headingName.appendChild(hName);

    dfloatnum.appendChild(dfloatleft);
    dfloatnum.appendChild(dfloatright);
    dfloatnum.appendChild(hrline);
    dfloatnum.appendChild(headingName);

    page.appendChild(dfloatnum);
  }

  private generateFooterSection(page: HTMLDivElement, pageNumber: number): void {
    const footerSection = document.createElement('div');
    footerSection.style.position = 'absolute';
    footerSection.style.bottom = '0';
    footerSection.style.left = '0';
    footerSection.style.width = '97%';
    footerSection.style.display = 'flex';
    footerSection.style.justifyContent = 'space-between';
    footerSection.style.alignItems = 'center';
    footerSection.style.backgroundColor = '#fff';

    const dateTimeDiv = document.createElement('div');
    dateTimeDiv.style.width = '50%';
    dateTimeDiv.style.textAlign = 'left';

    const dateTimeText = document.createElement('p');
    dateTimeText.className = 'footer1';
    dateTimeText.id = 'foot1';

    const today = new Date();
    const date = `${today.getDate()}-${today.getMonth() + 1}-${today.getFullYear()}`;
    let hours = today.getHours();
    const amOrPm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const seconds = String(today.getSeconds()).padStart(2, '0');
    dateTimeText.innerHTML = `${date} ${hours}:${minutes}:${seconds} ${amOrPm}`;
    dateTimeDiv.appendChild(dateTimeText);

    const pageNumberDiv = document.createElement('div');
    pageNumberDiv.style.width = '50%';
    pageNumberDiv.style.textAlign = 'right';

    const pageText = document.createElement('p');
    pageText.className = 'footer2';
    pageText.innerHTML = `Page No: ${pageNumber}`;
    pageNumberDiv.appendChild(pageText);

    footerSection.appendChild(dateTimeDiv);
    footerSection.appendChild(pageNumberDiv);
    page.appendChild(footerSection);
  }
}
