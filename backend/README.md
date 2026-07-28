# Qliclabs Backend

Django + Django REST Framework API that stores Party form submissions in a SQLite database.

## Setup

```
cd backend
python -m venv venv
venv\Scripts\activate      # on Windows
pip install -r requirements.txt
python manage.py migrate
```

## Run

```
python manage.py runserver 8000
```

API is served at `http://localhost:8000/api/parties/` (list/create) and
`http://localhost:8000/api/parties/<id>/` (retrieve/update/delete).
Django admin is at `http://localhost:8000/admin/` (run `python manage.py createsuperuser` first).

The Angular app (`ng serve`, default `http://localhost:4200`) is already allowed via CORS
and points `PartyService` at `http://localhost:8000/api/parties/`.
