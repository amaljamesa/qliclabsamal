import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { Party, PartyDraft } from '../models/party.model';

const API_URL = 'http://localhost:8000/api/parties/';

@Injectable({
  providedIn: 'root'
})
export class PartyService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<Party[]> {
    return this.http.get<Party[]>(API_URL);
  }

  create(draft: PartyDraft): Promise<Party> {
    return firstValueFrom(this.http.post<Party>(API_URL, draft));
  }
}
