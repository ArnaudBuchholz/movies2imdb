'use strict'

/* global gpf, FileReader, prompt, btoa */

const tags = {
  tr: 0,
  td: 0,
  a: 0,
  button: 0,
  div: 0
}
Object.keys(tags).forEach(tag => {
  tags[tag] = gpf.web.createTagFunction(tag)
})

const NOT_IMDB = 'n/a'

let moviesFileName
let movies = []
let imdb = {
  select: [],
  movies: {},
  actors: {}
}

function btn (index) {
  return document.getElementById(`btn-${index}`)
}

function mnu (index) {
  return document.getElementById(`mnu-${index}`)
}

function progress (count = movies.filter(movie => !!movie.imdb).length, total = movies.length) {
  const bar = document.getElementById('progress')
  const ratio = Math.floor(100 * count / total)
  bar.setAttribute('aria-valuenow', ratio)
  bar.setAttribute('style', `width: ${ratio}%`)
  bar.innerHTML = `${ratio}%`
}

function select (index, imdbId) {
  movies[index].imdb = imdbId
  const button = btn(index)
  button.innerHTML = imdbId
  button.classList.remove('btn-primary')
  button.classList.add('btn-success')
  imdb.select[index] = imdbId
  progress()
}

function query (search) {
  return gpf.http.get(`/imdb-query/${search}`)
    .then(response => {
      const text = response.responseText
      const len = text.length
      const pos = text.indexOf('{')
      return text.substring(pos, len - 1)
    })
    .then(responseText => JSON.parse(responseText))
    .then(responseJSON => responseJSON.d)
}

function search (movie, index) {
  const title = movie.title.toLowerCase().replace(/:|%/g, ' ')
  if (!title) {
    return false
  }
  return query(title.toLowerCase())
    .then(suggestions => suggestions.filter(suggestion => suggestion.q && suggestion.q !== 'video game'))
    .then(suggestions => {
      if (!suggestions || !suggestions.length) {
        return
      }
      suggestions
        .sort((s1, s2) => s2.y - s1.y)
        .forEach(suggestion => tags.a({
          className: 'dropdown-item',
          'data-index': index,
          'data-imdb': suggestion.id,
          href: `https://www.imdb.com/title/${suggestion.id}`,
          target: 'imdb'
        }, `${suggestion.id}: ${suggestion.l} [${suggestion.y}]`).appendTo(mnu(index)))
      if (!movie.imdb) {
        if (suggestions.length === 1) {
          return select(index, suggestions[0].id)
        }
        const exactTitles = suggestions.filter(suggestion => suggestion.l.toLowerCase() === title)
        if (exactTitles.length === 1) {
          return select(index, exactTitles[0].id)
        }
      }
    })
    .catch(() => {})
}

function extract (imdbId) {
  if (imdb.movies[imdbId]) {
    return Promise.resolve(imdb.movies[imdbId])
  }
  const movie = {}
  return query(imdbId)
    .then(suggestions => {
      movie.image = suggestions[0].i
      return gpf.http.get(`/imdb-title/${imdbId}`)
    })
    .then(response => response.responseText)
    .then(titleHtml => {
      // <a href="/year/1979/?ref_=tt_ov_inf">1979</a>
      movie.year = parseInt(/<a href="\/year\/([0-9]+)\//.exec(titleHtml)[1], 10)
      // <time datetime="PT117M">1h 57min</time>
      movie.duration = parseInt(/<time datetime="PT([^"]+)M"/.exec(titleHtml)[1], 10)
      // <a href="/search/title?genres=horror&amp;explore=title_type,genres&amp;ref_=tt_ov_inf">Horror</a>
      const genres = []
      titleHtml.replace(/<a href="\/search\/title\?genres=([^&]+)&/g, (match, genre) => {
        if (!genres.includes(genre)) {
          genres.push(genre)
        }
      })
      movie.genres = genres
      // <a href="/name/nm0000244/?ref_=tt_ov_st_sm">Sigourney Weaver</a>
      const cast = {}
      titleHtml
        .split('<table class="cast_list">')[1]
        .split('</table>')[0]
        .replace(/\n/g, '')
        .replace(/<a href="\/name\/([a-z0-9]+)\/[^"]+"\s*>\s*([^<]+)<\/a>(?:[^<]|<[^a])*<a href="\/title\/[^"]+"\s*>([^<]+)<\/a>/gm, (match, id, name, role) => {
          cast[id] = role
          if (!Object.prototype.hasOwnProperty.call(imdb.actors, id)) {
            console.log('IMDB actor', id, name)
            imdb.actors[id] = name
          }
        })
      movie.cast = cast
      return gpf.http.get(`/imdb-releaseinfo/${imdbId}`)
    })
    .then(response => response.responseText.replace(/\n/g, ''))
    .then(releaseInfoHtml => {
      movie.titles = {}
      releaseInfoHtml.replace(/<td class="aka-item__name">([^<]*)<\/td>\s*<td class="aka-item__title">([^<]*)<\/td>/gm, (match, country, title) => {
        const lowerCasedCountry = country.toLowerCase().trim()
        if (lowerCasedCountry === 'france') {
          movie.titles.fr = title
        } else if (lowerCasedCountry === 'world-wide (english title)') {
          movie.titles.en = title
        } else if (lowerCasedCountry === '(original title)') {
          movie.titles.original = title
        }
      })
    })
    .then(() => {
      imdb.movies[imdbId] = movie
      console.log('IMDB movie', imdbId, movie)
      return movie
    })
    .catch(reason => {
      console.error('IMDB movie', imdbId, reason)
    })
}

function refresh () {
  const tbody = document.getElementById('movies')
  tbody.innerHTML = ''
  progress(0, 1)

  movies.forEach((movie, index) => {
    if (movie.title) {
      movie.imdb = imdb.select[index]
      tags.tr({ id: `row-${index}` },
        tags.td(movie.title),
        tags.td([
          tags.button({
            id: `btn-${index}`,
            className: `btn dropdown-toggle btn-${movie.imdb ? 'success' : 'primary'}`,
            'data-imdb': movie.imdb,
            'data-toggle': 'dropdown',
            'aria-haspopup': true,
            'aria-expanded': false
          }, movie.imdb ? movie.imdb : 'Search'),
          tags.div({
            id: `mnu-${index}`,
            className: 'dropdown-menu',
            'aria-labelledby': `btn-${index}`
          }, [
            tags.a({
              className: 'dropdown-item',
              href: '#',
              'data-index': index,
              'data-action': 'view'
            }, 'View IMDB page'),
            tags.a({
              className: 'dropdown-item',
              href: '#',
              'data-index': index,
              'data-action': 'extract'
            }, 'Extract IMDB infos'),
            tags.a({
              className: 'dropdown-item',
              href: '#',
              'data-index': index,
              'data-action': 'manual'
            }, 'Manual input'),
            tags.a({
              className: 'dropdown-item',
              href: '#',
              'data-index': index,
              'data-action': 'copy'
            }, 'Copy to (series)'),
            tags.a({
              className: 'dropdown-item',
              href: '#',
              'data-index': index,
              'data-imdb': NOT_IMDB
            }, 'Not an imbd movie'),
            tags.div({ className: 'dropdown-divider' })
          ])
        ])
      ).appendTo(tbody)
    }
  })
  progress()
  gpf.forEachAsync(movies, search)
}

document.getElementById('csv-input').addEventListener('change', function () {
  const file = this.files[0]
  moviesFileName = file.name
  const reader = new FileReader()
  reader.onload = event => {
    const input = new gpf.stream.ReadableString(event.target.result)
    const lineAdapter = new gpf.stream.LineAdapter()
    const csvParser = new gpf.stream.csv.Parser()
    const output = new gpf.stream.WritableArray()
    gpf.stream.pipe(input, lineAdapter, csvParser, output)
      .then(() => {
        movies = output.toArray()
        refresh()
      })
  }
  reader.readAsText(file)
})

document.getElementById('movies').addEventListener('click', event => {
  const target = event.target
  const targetName = (target.tagName || '').toLowerCase()
  if (targetName === 'a') {
    if (target.dataset.imdb) {
      select(target.dataset.index, target.dataset.imdb)
    }
    if (target.dataset.action) {
      const imdbId = movies[target.dataset.index].imdb
      if (target.dataset.action === 'manual') {
        const input = prompt('Enter IMDB id (tt0123456)', imdbId)
        if (input) {
          select(target.dataset.index, input)
        }
      }
      if (target.dataset.action === 'copy') {
        const regexpSrc = prompt('Enter match (regexp)')
        if (regexpSrc) {
          const regexp = new RegExp(regexpSrc)
          movies.forEach((movie, index) => {
            if (regexp.exec(movie.title)) {
              select(index, imdbId)
            }
          })
        }
      }
      if (target.dataset.action === 'view') {
        window.open(`https://www.imdb.com/title/${imdbId}`, 'imdb')
      }
      if (target.dataset.action === 'extract') {
        extract(imdbId)
      }
    }
    event.preventDefault()
  }
  return false
})

document.getElementById('export').addEventListener('click', () => {
  const link = document.getElementById('export-link')
  gpf.forEachAsync(movies, async (movie, index) => {
    progress(index)
    if (movie.imdb && movie.imdb !== NOT_IMDB) {
      return extract(movie.imdb)
    }
  })
    .then(function () {
      const ansii = JSON.stringify(imdb).split('').map(char => {
        const code = char.charCodeAt(0)
        if (code > 127) {
          return `\\u${Number(code).toString(16).padStart(4, '0')}`
        }
        return char
      })
      link.setAttribute('href', `data:application/json;base64,${btoa(ansii.join(''))}`)
      if (moviesFileName) {
        link.setAttribute('download', `${moviesFileName}.imdb.json`)
      }
      link.click()
      progress()
    })
})

document.getElementById('import-input').addEventListener('change', function () {
  const file = this.files[0]
  const reader = new FileReader()
  reader.onload = event => {
    imdb = JSON.parse(event.target.result)
    if (!Array.isArray(imdb.select)) {
      imdb.select = Object.keys(imdb.select).reduce((array, index) => {
        array[index] = imdb.select[index]
        return array
      }, [])
    }
    if (!imdb.movies) {
      imdb.movies = {}
    }
    if (!imdb.actors) {
      imdb.actors = {}
    }
    refresh()
  }
  reader.readAsText(file)
})
